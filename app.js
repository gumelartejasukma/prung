var express = require("express");
var bodyParser = require("body-parser");
var mongodb = require("mongodb");
var crypto = require('crypto');
var imgur = require('imgur');

var ObjectID = mongodb.ObjectID;

var USERS_COLLECTION = "users";
var EVENTS_COLLECTION = "events";
var HASHTAGS_COLLECTION = "hashtags";
var CHATS_COLLECTION = "chats";

var app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Create link to Angular build directory
// var distDir = __dirname + "/dist/";
// app.use(express.static(distDir));

// Create a database variable outside of the database connection callback to reuse the connection pool in your app.
var db;

// Connect to the database before starting the application server.
mongodb.MongoClient.connect(process.env.MONGODB_URI || "mongodb+srv://admin:admin@cluster0-jofyq.gcp.mongodb.net/prungdb?retryWrites=true", function (err, client) {
  if (err) {
    console.log(err);
    process.exit(1);
  }

  // Save database object from the callback for reuse.
  db = client.db();
  console.log("Database connection ready");

  // Initialize the app.
  var server = app.listen(process.env.PORT || 8080, function () {
    var port = server.address().port;
    console.log("App now running on port", port);
  });
});

// CONTACTS API ROUTES BELOW

// Generic error handler used by all endpoints.
function handleError(res, reason, message, code) {
  console.log("ERROR: " + reason);
  res.status(code || 500).json({"error": message});
}

/*  "/api/contacts"
 *    GET: finds all contacts
 *    POST: creates a new contact
 */

 app.post("/hashtag", function(req, res) {
   var hashtag = req.body;
   if (!hashtag.name) {
     handleError(res, "Invalid user input", "Must provide hashtag", 400);
   } else {
     db.collection(HASHTAGS_COLLECTION).insertOne(hashtag, function(err, doc) {
       if (err) {
         handleError(res, err.message, "Failed to create new contact.");
       } else {
         res.status(200).json(doc.ops[0]);
       }
     });
   }
 });

 app.get("/hashtags", function(req, res) {
   db.collection(HASHTAGS_COLLECTION).find({}).toArray(function(err, docs) {
     if (err) {
       handleError(res, err.message, "Failed to get contacts.");
     } else {
       res.status(200).json(docs);
     }
   });
 });

 app.post("/login/facebook", function(req, res) {
   db.collection(USERS_COLLECTION).findOne({ facebook_id: req.body.facebook_id }, function(err, doc) {
     if (err) {
       handleError(res, err.message, "Failed to get contact");
     } else {
       if(!doc){
         addUser(req,res);
       }else{
         res.status(200).json(doc);
       }
     }
   });
 });

 app.post("/join", function(req, res) {
   let body = req.body;
   db.collection(EVENTS_COLLECTION).findOneAndUpdate({ _id: new ObjectID(body.id) },{$push:{members:body.user_id}},{safe:true,upsert:true},function(err, doc) {
     if (err) {
       handleError(res, err.message, "Failed to update event");
     } else {
       db.collection(USERS_COLLECTION).findOneAndUpdate({ _id: new ObjectID(body.user_id) },{$push:{events:body.id}},{safe:true,upsert:true},function(err, doc) {
         if (err) {
           handleError(res, err.message, "Failed to update event");
         } else {
           doc.ops[0].network_message = "Success join Event";
           res.status(200).json(doc.ops[0]);
         }
       });
     }
   });
 });

 app.post("/chats", function(req, res) {
   let body = req.body;
   var chat = {};
   var user = {};
   user.name = body.user_name;
   user.id = body.user_id;
   user.picture = body.user_picture;
   chat.user = user;
   chat.message = body.message;
   chat.created_at = Date.now();
   db.collection(CHATS_COLLECTION+body.event_id).insertOne(chat, function(err, doc) {
     if (err) {
       handleError(res, err.message, "Failed to create hashtag.");
     } else {
       res.status(200).json(doc.ops[0]);
     }
   });
 });

  app.get("/chats", function(req, res) {
    db.collection(CHATS_COLLECTION+req.query.event_id).find({}).sort({created_at:-1}).toArray(function(err, docs) {
      if (err) {
        handleError(res, err.message, "Failed to get chats.");
      } else {
        res.status(200).json(docs);
      }
    });
  });

 app.post("/event", function(req, res) {
   var event = req.body;
   if(!event.hashtag_id){
     var hashtag = {};
     hashtag.name = event.hashtag_name;
     db.collection(HASHTAGS_COLLECTION).insertOne(hashtag, function(err, doc) {
       if (err) {
         handleError(res, err.message, "Failed to create hashtag.");
       } else {
         req.body.hashtag_id = doc.ops[0]._id;
         addEvent(req,res);
       }
     });
   }else{
     addEvent(req,res);
   }
 });

 app.get("/events", function(req, res) {
   if(!req.query.id){
     db.collection(EVENTS_COLLECTION).find({}).toArray(function(err, docs) {
       if (err) {
         handleError(res, err.message, "Failed to get events.");
       } else {
         res.status(200).json(docs);
       }
     });
   }else{
     db.collection(EVENTS_COLLECTION).findOne({ _id: new ObjectID(req.query.id) }, function(err, doc) {
       if (err) {
         handleError(res, err.message, "Event not found");
       } else {
         if(doc.members && doc.members.length>0){
           let members = doc.members.map(function(memberId){
             return new ObjectID(memberId);
           });
           let filter = {_id:{$in : members}};
           db.collection(USERS_COLLECTION).find(filter).toArray(function(err, docs) {
             if (err) {
               handleError(res, err.message, "Failed to get members.");
             } else {
               doc.members = docs.map(function(member){
                 delete member.events;
                 delete member.token;
                 delete member.facebook_id;
                 return member;
               });
               res.status(200).json(doc);
             }
           });
         }else{
           res.status(200).json(doc);
         }
       }
     });
   }
 });

app.get("/users", function(req, res) {
  if(!req.query.id){
    db.collection(USERS_COLLECTION).find({}).toArray(function(err, docs) {
      if (err) {
        handleError(res, err.message, "Failed to get contacts.");
      } else {
        res.status(200).json(docs);
      }
    });
  }else{
    db.collection(USERS_COLLECTION).findOne({ _id: new ObjectID(req.query.id) }, function(err, doc) {
      if (err) {
        handleError(res, err.message, "Failed to get contact");
      } else {
        if(doc.events && doc.events.length>0){
          let events = doc.events.map(function(eventId){
            return new ObjectID(eventId);
          });
          let filter = {_id:{$in : events}};
          db.collection(EVENTS_COLLECTION).find(filter).toArray(function(err, docs) {
            if (err) {
              handleError(res, err.message, "Failed to get events.");
            } else {
              doc.events = docs;
              res.status(200).json(doc);
            }
          });
        }else{
          res.status(200).json(doc);
        }
      }
    });
  }
});

app.post("/users", function(req, res) {
  addUser(req,res);
});

/*  "/api/contacts/:id"
 *    GET: find contact by id
 *    PUT: update contact by id
 *    DELETE: deletes contact by id
 */

// app.get("/users/:id", function(req, res) {
//
// });

app.put("/users/:id", function(req, res) {
  var updateDoc = req.body;
  delete updateDoc._id;

  db.collection(USERS_COLLECTION).updateOne({_id: new ObjectID(req.params.id)}, updateDoc, function(err, doc) {
    if (err) {
      handleError(res, err.message, "Failed to update contact");
    } else {
      updateDoc._id = req.params.id;
      res.status(200).json(updateDoc);
    }
  });
});

app.delete("/users/:id", function(req, res) {
  db.collection(USERS_COLLECTION).deleteOne({_id: new ObjectID(req.params.id)}, function(err, result) {
    if (err) {
      handleError(res, err.message, "Failed to delete contact");
    } else {
      res.status(200).json(req.params.id);
    }
  });
});

function generateToken(){
  return crypto.randomBytes(Math.ceil(48/2)).toString('hex').slice(0,48);
}

function addEvent(req,res){
  var body = req.body;
  var event = {};
  event['title'] = body.title;
  var venue = {};
  venue['name'] = body.venue_name;
  venue['latitude'] = body.venue_latitude;
  venue['longitude'] = body.venue_longitude;
  event['venue'] = venue;
  event['description'] = body.description;
  var hashtag = {};
  hashtag['id'] = body.hashtag_id;
  hashtag['name'] = body.hashtag_name;
  event['hashtag'] = hashtag;
  var by = {};
  by['id'] = body.user_id;
  by['name'] = body.user_name;
  event['by'] = by;
  event['date'] = body.date;
  event['time'] = body.time;
  event['player_needed'] = body.player_needed;
  event['members'] = [body.user_id];

  db.collection(EVENTS_COLLECTION).insertOne(event, function(err, doc) {
    if (err) {
      handleError(res, err.message, "Failed to create new event.");
    } else {
      db.collection(USERS_COLLECTION).findOneAndUpdate({ _id: new ObjectID(body.user_id) },{$push:{events:doc.ops[0]._id}},{safe:true,upsert:true},function(err2, doc2) {
        if (err2) {
          handleError(res, err2.message, "Failed to update event");
        } else {
          doc.ops[0].network_message = "Success create event";
          res.status(200).json(doc.ops[0]);
        }
      });
    }
  });
}

function addUser(req,res){
  var newUser = req.body;
  newUser.token = generateToken();

  if (!newUser.name) {
    handleError(res, "Invalid user input", "Must provide a name", 400);
  } else {
    db.collection(USERS_COLLECTION).insertOne(newUser, function(err, doc) {
      if (err) {
        handleError(res, err.message, "Failed to create new contact.");
      } else {
        res.status(200).json(doc.ops[0]);
      }
    });
  }
}
