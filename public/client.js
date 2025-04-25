const clientSocket = io();

const roomList = document.querySelector("#roomList");


const messageInput = document.querySelector("#chatInput");
const chatBox = document.querySelector("#chat");
const form = document.querySelector("#chatForm");

let roomId = null; 

//rum

document.addEventListener("DOMContentLoaded", () => {
    const roomScript = document.querySelector('script[data-room-id]');
    roomId = roomScript ? roomScript.getAttribute("data-room-id") : null;

    if (roomId) {
        clientSocket.emit("join-room", roomId);
    }
});

document.addEventListener("DOMContentLoaded", () => {
    clientSocket.emit("get-rooms");
});

clientSocket.on("room-list", (rooms) => {
    updateRoomList(rooms);
});

clientSocket.on("room-created", (rooms) => {
    updateRoomList(rooms);
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

let roomdeleteButtons = document.querySelectorAll(".roomDelete");
roomdeleteButtons.forEach((button) => {
    button.addEventListener("click", (e) => {
        const roomId = e.target.getAttribute("data-room-id");
        clientSocket.emit("room-delete", { roomId });

        const roomItem = e.target.closest(".room-item");
        if (roomItem) {
            roomItem.remove();
        }
    });
});

clientSocket.on("room-deleted", (rooms) => {
    updateRoomList(rooms);
    
});

//meddelanden
if (messageInput && chatBox && form) {
    const roomScript = document.querySelector('script[data-room-id]');
    const currentUserId = roomScript ? roomScript.getAttribute("data-user-id") : null;


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

    clientSocket.on("message-edited", ({ messageId, newMessage }) => {
        const messageDiv = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageDiv) {
            const messageSpan = messageDiv.querySelector(".message");
            messageSpan.textContent = newMessage;
        }
    });
    
    function displayMessage(msg, isSender) {
        const div = document.createElement("div");
        const p = document.createElement("p");
    
        const usernameSpan = document.createElement("span");
        usernameSpan.classList.add("username");
        usernameSpan.textContent = msg.username + ":";

        const messageSpan = document.createElement("span");
        messageSpan.classList.add("message");
        messageSpan.textContent = msg.message;
    
        p.appendChild(usernameSpan);
        p.appendChild(messageSpan);
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
        editIcon.addEventListener("click", (e) => {
            const parentDiv = e.target.parentElement;
            const messageId = div.getAttribute("data-message-id");
            editMode(messageId, parentDiv);
            
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

    function editMode(messageId, parentDiv){
        
        const editIcon = document.querySelector(".edit-icon");
        const messageText = parentDiv.querySelector("p").textContent;
        let [username, ...messageParts] = messageText.split(":");
        let message = messageParts.join(":");


        const editForm = document.createElement("form");
        const input = document.createElement("input");
        input.type = "text";
        input.value = message;
        input.classList.add("edit-form");

        editForm.appendChild(input);

        let messageDiv = parentDiv.querySelector(".message");
        messageDiv.replaceWith(editForm);

        editForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const newMessage = input.value.trim();
            if (newMessage) {
                clientSocket.emit("edit-message", { messageId, newMessage });
                editForm.replaceWith(messageDiv);
                messageDiv.textContent = newMessage;
            } else {
                alert("Message cannot be empty.");
            }
        });


        console.log (parentDiv);
        console.log(messageId);
        console.log(message);
    }
}


