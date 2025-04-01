const clientSocket = io();

const roomList = document.querySelector("#roomList");
if (!roomList) console.error("Error: #roomList not found!");

const messageInput = document.querySelector("#chatInput");
const chatBox = document.querySelector("#chat");
const form = document.querySelector("#chatForm");

let roomId = null; 

//rum
document.addEventListener("DOMContentLoaded", () => {
    clientSocket.emit("get-rooms");
});

clientSocket.on("room-list", (rooms) => {
    updateRoomList(rooms);
});

clientSocket.on("room-created", (rooms) => {
    updateRoomList(rooms);
});

document.addEventListener("DOMContentLoaded", () => {
    const roomScript = document.querySelector('script[data-room-id]');
    roomId = roomScript ? roomScript.getAttribute("data-room-id") : null;

    if (roomId) {
        clientSocket.emit("join-room", roomId);
    }
});

function updateRoomList(rooms) {
    if (!roomList) return;
    roomList.innerHTML = ""; 

    rooms.forEach((room) => {
        const a = document.createElement("a");
        a.textContent = room.Roomname; 
        a.href = `/chat/${room.Roomname}`; 
        a.classList.add("rooms");
        
        if (room.RoomPassword) {
            a.setAttribute("id", "passwordedRoom");

            const lockIcon = document.createElement("i");
            lockIcon.classList.add("fas", "fa-lock", "lock-icon");
            a.appendChild(lockIcon);
        }

        roomList.appendChild(a);
    });
}

//meddelanden
if (messageInput && chatBox && form) {
    const roomScript = document.querySelector('script[data-room-id]');
    const currentUserId = roomScript ? roomScript.getAttribute("data-user-id") : null;

    clientSocket.on("load-messages", (messages) => {
        messages.forEach((msg) => {
            const isSender = msg.userId === currentUserId;
            displayMessage(msg, isSender);
        });
    });

    clientSocket.on("get-message", (msg) => {
        if (!currentUserId) {
            console.error("Error: currentUserId is not defined.");
            return;
        }

        const isSender = msg.userId === currentUserId;
        displayMessage(msg, isSender);
    });

    clientSocket.on("message-deleted", ({ messageId }) => {
        const messageDiv = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageDiv) {
            messageDiv.remove();
        }
    });
    
    form.addEventListener("submit", (e) => {
        e.preventDefault();
        console.log("Form submitted!");
        let message = messageInput.value.trim();
        if (!message) return;

        messageInput.value = "";

        if (roomId) {
            clientSocket.emit("send-message", { roomId, message });
        } else {
            console.error("Room ID is not defined.");
        }
    });

    function displayMessage(msg, isSender) {
        const div = document.createElement("div");
        const p = document.createElement("p");
    
        const usernameSpan = document.createElement("span");
        usernameSpan.classList.add("username");
        usernameSpan.textContent = msg.username + ":";
    
        const messageContent = document.createTextNode(msg.message);
    
        p.appendChild(usernameSpan);
        p.appendChild(messageContent);
        div.appendChild(p);
        div.setAttribute("data-message-id", msg.messageId);
    
        if (isSender) {
            div.classList.add("my-message");
            messageMenu(div, msg);
        } else {
            div.classList.add("other-message");
        }
    
        chatBox.append(div);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    clientSocket.on("error-message", (error) => {
        alert(error);
    });


    clientSocket.on("system-message", (msg) => {
        const div = document.createElement("div");
        div.classList.add("system-message");
        div.textContent = msg;
        chatBox.append(div);
        chatBox.scrollTop = chatBox.scrollHeight;
    });

    //Här under är det bara saker som har med stil att göra, delvis Ai gjort
    document.getElementById("menuToggle").addEventListener("click", function() {
        let menu = document.getElementById("roomList");
        let button = document.getElementById("menuToggle");

        if (menu.classList.contains("active")) {
            menu.classList.remove("active");
            button.style.left = "10px";
            button.style.position = "fixed";
        } else {
            menu.classList.add("active");
            button.style.left = "15px"; 
            button.style.position = "absolute";
        }
    });


    document.getElementById("menuToggleInside").addEventListener("click", function() {
        document.getElementById("roomList").classList.remove("active");
        document.getElementById("menuToggle").style.left = "10px"; 
        document.getElementById("menuToggle").style.position = "fixed";
    });

    function messageMenu(div, msg) {
        const dotsIcon = document.createElement("i");
        dotsIcon.classList.add("fas", "fa-ellipsis-h", "dots-icon");
        dotsIcon.addEventListener("click", () => {
            div.classList.toggle("show-icons");
        });
        div.appendChild(dotsIcon);
    
        const editIcon = document.createElement("i");
        editIcon.classList.add("fas", "fa-edit", "edit-icon");
        editIcon.addEventListener("click", () => {
            console.log("Edit clicked for message:", msg.message);
        });
        div.appendChild(editIcon);
    
        const deleteIcon = document.createElement("i");
        deleteIcon.classList.add("fas", "fa-trash", "delete-icon");
        deleteIcon.addEventListener("click", (e) => {
            const messageId = div.getAttribute("data-message-id");
            clientSocket.emit("delete-message", { messageId });
        });
        div.appendChild(deleteIcon);
    
        div.addEventListener("mouseleave", () => {
            div.classList.remove("show-icons");
        });
    }
}


