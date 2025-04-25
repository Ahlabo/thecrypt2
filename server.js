//dependencies
const express = require("express");
const app = express();
const fs = require("fs");
const { render, getJson, showChat } = require('./utils.js');
const bcrypt = require("bcryptjs");
const session = require("express-session");

//säkerhet
const { v7: uuidv7 } = require("uuid");
const escape = require("escape-html");


//server
const { createServer } = require("http");
const { Server } = require("socket.io");
const { profile } = require("console");
const server = createServer(app);
const io = new Server(server);
server.listen(8080);

//middleware
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

//session
const sessionMw = session({
    secret: 'keyboard dog',
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24
    }
});
app.use(sessionMw);
io.engine.use(sessionMw);

//routes
io.on("connection", handleConnection);
app.get("/chat/:roomId", handleRooms);
app.get("/session", handleSession);
app.get("/register", registerPage);
app.get("/login", loginPage);
app.get("/logout", logout);
app.post("/register", register);
app.post("/login", login);
app.get("/createRoom", roomCreator);
app.post("/createRoom", createRoom);
app.post("/joinRoom/:roomId", passwordRoomhandler);
app.get("/profile", profilePage);


//page handlers
app.get("/", (req, res) => {
    let content = `
    <div id="roomList" class="main-page"></div>
    <script src="/client.js" defer></script>
    `;
 return res.send(render(content, req));
});

function handleSession(req, res) {
    res.send((req.session));
}

function registerPage(req, res) {
    let content = `
    <div class="form-container">
        <h1>Register</h1>
        <form action="/register" method="post">
            <div class="input-group">
                <i class="icon fas fa-user"></i>
                <input type="text" name="username" placeholder="Username" required />
            </div>
            <div class="input-group">
                <i class="icon fas fa-envelope"></i>
                <input type="email" name="email" placeholder="Email" required />
            </div>
            <div class="input-group">
                <i class="icon fas fa-lock"></i>
                <input type="password" name="password" placeholder="Password" required />
            </div>
            <input type="submit" value="Register" />
        </form>
        <a href="/" class="back-button">Back to Main Page</a>
    </div>
      <script src="/client.js" defer></script>
    `;
    return res.send(render(content, req));
}

function loginPage(req, res) {
    let content = `
    <div class="form-container">
        <h1>Login</h1>
        <form action="/login" method="post">
            <div class="input-group">
                <i class="icon fas fa-envelope"></i>
                <input type="email" name="email" placeholder="Email" required />
            </div>
            <div class="input-group">
                <i class="icon fas fa-lock"></i>
                <input type="password" name="password" placeholder="Password" required />
            </div>
            <input type="submit" value="Login" />
        </form>
        <a href="/" class="back-button">Back to Main Page</a>
    </div>
      <script src="/client.js" defer></script>
    `;
    return res.send(render(content, req));
}

function profilePage(req, res) {
    if (!req.session.auth) return res.redirect("/login");

    let rooms = getJson("rooms");
    let userRooms = rooms.filter(r => r.userId == req.session.userId);
    console.log(userRooms);

    let userRoomsHtml = userRooms.map(room => `
        <div class="room-item">
            <a href="/chat/${room.Roomname}">${room.Roomname}</a>
            <button class="roomDelete" data-room-id="${room.Roomname}">Delete</button>
        </div>
    `).join("");
   
    let content = `
    <div class="profile-container">
        <h1>Profile</h1>
        <p>Username: ${req.session.username}</p>
        <p>Email: ${req.session.email}</p>
    </div>
    <div class="action-buttons">
        <a href="/logout" class="logout-button">Logout</a>
        <a href="/" class="back-button">Back to Main Page</a>
    </div>
    <div class="room-list-container">
        <h2>Your Rooms</h2>
        <div class="room-list" id="userRoomList">
        ${userRoomsHtml}
        </div>
    </div>
      <script src="/client.js" defer></script>
    `;
    return res.send(render(content, req));
}



// Handle socket connections
function handleConnection(socket) {
    console.log("New connection:", socket.id);

    socket.on("get-rooms", () => {
        let rooms = getJson("rooms");
        socket.emit("room-list", rooms);
    });


    socket.on("join-room", (roomId) => {
        console.log(`Socket ${socket.id} joined room ${roomId}`);
        socket.join(roomId);

        let chatlog = getJson("chatlog");
        let roomMessages = chatlog.filter((msg) => msg.roomId === roomId);

        socket.emit("load-messages", roomMessages);

        setTimeout(() => {
            socket.emit("system-message", `You have joined: ${roomId}`);
        }, 50);
    });

    socket.on("send-message", ({ roomId, message }) => {
        if (!socket.request.session || !socket.request.session.auth) {
            console.log("Unauthorized message attempt by:", socket.id);
            socket.emit("error-message", "You must be logged in to send messages.");
            return;
        }
        const messageId = uuidv7();
        const username = socket.request.session.username;
        const userId = socket.request.session.userId;

        message = escape(message);

        let chatlog = getJson("chatlog");
        const newMessage = { roomId, message, userId, username,messageId, timestamp: new Date()};
        chatlog.push(newMessage);
        fs.writeFileSync(__dirname + "/data/chatlog.json", JSON.stringify(chatlog, null, 3));

        io.to(roomId).emit("get-message", newMessage);
    });

    socket.on("delete-message", ({ messageId }) => {
        let chatlog = getJson("chatlog");
        let SelectedMessage = chatlog.find((msg) => msg.messageId === messageId);

        if (!SelectedMessage) return console.log("Message not found");
        if (SelectedMessage.userId !== socket.request.session.userId) return console.log("You are not the sender of this message");

        chatlog = chatlog.filter((msg) => msg.messageId !== messageId);
        fs.writeFileSync(__dirname + "/data/chatlog.json", JSON.stringify(chatlog, null, 3));
        io.emit("message-deleted", { messageId });
    });

    socket.on("edit-message", ({messageId, newMessage})=>{
        let chatlog = getJson("chatlog");
        let SelectedMessage = chatlog.find((msg) => msg.messageId === messageId);

        if (!SelectedMessage) return console.log("Message not found");
        if (SelectedMessage.userId !== socket.request.session.userId){
            io.emit("error-message", "You are not the sender of this message");
            return;
        }

        SelectedMessage.message = newMessage;
        fs.writeFileSync(__dirname + "/data/chatlog.json", JSON.stringify(chatlog, null, 3));
        io.emit("message-edited", { messageId, newMessage });
    });

    socket.on("room-delete", ({ roomId }) => {
        let rooms = getJson("rooms");
        let chatlog = getJson("chatlog");

        rooms = rooms.filter((room) => room.Roomname !== roomId);
        chatlog = chatlog.filter((msg) => msg.roomId !== roomId);

        fs.writeFileSync(__dirname + "/data/rooms.json", JSON.stringify(rooms, null, 3));
        fs.writeFileSync(__dirname + "/data/chatlog.json", JSON.stringify(chatlog, null, 3));

        io.emit("room-deleted", rooms);
    });
}

function roomCreator(req, res) {
    let content = `
    <div class="create-room-container">
        <h1>Create a Room</h1>
        <form action="/createRoom" method="POST">
            <input type="text" name="Roomname" placeholder="Enter room name" required />
            <input type="password" name="RoomPassword" placeholder="Enter room password (optional)" />
            <input type="submit" value="Create Room" />
        </form>
        <a href="/" class="back-button">Back to Main Page</a>
    </div>
      <script src="/client.js" defer></script>
    `;
    res.send(render(content, req));
}

function handleRooms(req, res) {
    try{


        const roomId = escape(req.params.roomId);

        let rooms = getJson("rooms");
        let room = rooms.find(r => r.Roomname === roomId);

        if (!room) {
            return res.status(404).send("Room not found");
        }

        if (room.RoomPassword) {
            let content = `
                <div class="form-container">
                    <h1>Enter Room Password</h1>
                    <form action="/joinRoom/${roomId}" method="POST">
                        <input type="password" name="RoomPassword" placeholder="Enter room password" required />
                        <input type="submit" value="Join Room" />
                    </form>
                    <a href="/" class="back-button">Back to Main Page</a>
                </div>
                <script src="/client.js" defer></script>
            `;
            return res.send(render(content, req));
        }

        let content = showChat(roomId, req.session.userId);
        res.send(render(content, req));

    } catch (error){
        console.error("Error handling rooms:", error.message);
        return res.status(500).send("Internal server error");
    }
}

async function passwordRoomhandler(req, res) {
    try{

        const roomId = escape(req.params.roomId);
        const { RoomPassword } = req.body;

        let rooms = getJson("rooms");
        let room = rooms.find(r => r.Roomname === roomId);

        if (!room) {
            return res.status(404).send("Room not found");
        }


        if (room.RoomPassword) {
            if (!RoomPassword || !req.session.auth) {
                return res.status(401).send("You need to be logged in and provide a password to join this room");
            }

            const isPasswordCorrect = await bcrypt.compare(RoomPassword, room.RoomPassword);
            if (!isPasswordCorrect) {
                return res.status(401).send("Wrong password");
            }
        }

        let content = showChat(roomId, req.session.userId);
        res.send(render(content, req));
        
    } catch (error){
        console.error("Error handling passworded room:", error.message);
        return res.status(500).send("Internal server error");
    }
}

async function createRoom(req, res) {
    try {
        let data = req.body;
        let rooms = getJson("rooms");
        data.userId = req.session.userId;

        if (req.session.auth == false) return res.send("You need to be logged in to create a room");

        let userRooms = rooms.filter(r => r.userId == data.userId);
        if (userRooms.length >= 3) return res.send("You can only create 3 rooms");

        data.Roomname = escape(data.Roomname);

        if (rooms.find(r => r.Roomname == data.Roomname)) return res.send("Room already exists");

        if (data.RoomPassword) {
            data.RoomPassword = await bcrypt.hash(data.RoomPassword, 12);
        }

        rooms.push(data);
        fs.writeFileSync(__dirname + "/data/rooms.json", JSON.stringify(rooms, null, 3));

        io.emit("room-created", rooms);

        console.log("Room:" + data.Roomname + " has been created");

        res.redirect("/");
    } catch (error) {
        return res.status(500).send("Error creating room: " + error.message);
    }
}


// Handle user registration and login
async function register(req, res) {
    try{
        let data = req.body;

        data.username = escape(data.username);
        data.email = escape(data.email);

        if (data.password.trim() === "" || data.email.trim() === "" || data.username.trim() === "") return res.send("please fill in everything")

        let userId = uuidv7();
        data.userId = userId;

        let users = getJson("users");

        data.password = await bcrypt.hash(data.password, 12);
        let userExist = users.find(u => u.email == data.email);
        let usernameExist = users.find(u => u.username == data.username);

        if (userExist || usernameExist) return res.send("User exists");
        users.push(data);
        fs.writeFileSync(__dirname + "/data/users.json", JSON.stringify(users, null, 3));
        res.redirect("/");
        console.log("User:" + data.email + " with password: " + data.password + " Has successfully registered");

    } catch (error) {
        console.error("Error during registration:", error.message);
        return res.status(500).send("Internal server error");
    }
}

async function login(req, res) {
    try{ 

        let data = req.body;

        data.email = escape(data.email);
    
        let users = getJson("users");
        let userExist = users.find(u => u.email == data.email);
    
        if (!userExist) return res.send("wrong email");
        let pwCheck = await bcrypt.compare(data.password, userExist.password);
        if (!pwCheck) return res.send("Wrong password");
    
        req.session.auth = true;
        req.session.email = data.email;
        req.session.username = userExist.username;
        req.session.userId = userExist.userId;
        console.log("login succeeded");
    
        res.redirect("/");
    } catch (error) {
        console.error("Error during login:", error.message);
        return res.status(500).send("Internal server error");
    }

}

function logout(req, res){
    try{
        req.session.destroy();
        res.redirect("/");
    } catch (error) {
        console.error("Error during logout:", error.message);
        return res.status(500).send("Internal server error");
    }
    
}