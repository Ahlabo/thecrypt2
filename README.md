# The crypt - Real time chat application

Jag dokumenterar projektet i den ordning användaren upplever sidan. Det vill säga, steg för steg genom sidans flöde. Saker som inte passar in där tar jag upp sist.
## Rum

### main page
När servern laddas skickas klienten ett event till servern för att begära en list med alla rum som finns.
    he~~
```js
// client.js
document.addEventListener("DOMContentLoaded", () => {
    clientSocket.emit("get-rooms");
});
```

Servern tar sedan emot begäran och hämtar rummen i variablen rooms och skickar sedan ner den till klienten.
```js
// server.js
socket.on("get-rooms", () => {
    let rooms = getJson("rooms");
    socket.emit("room-list", rooms);
});
```

När klienten tar emot eventet kallar den på funktionen updateRoomList som är en funktion som loopar ut varje rum i listan med hjälp av en forEach loop. för varje rum skapas en "< a >-tagg" och ger den datan för respektive rum. Den kollar också om rummet har ett lösenord och lägger då till en ikon för det. Efter det så lägger den in dessa nya rum i diven #roomList som både förekommer på main page och inne i menyn i chatterna.
```js
// client.js
const roomList = document.querySelector("#roomList");

clientSocket.on("room-list", (rooms) => {
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
```
### Create rooms

För att skapa rum använder jag en Create funktion som tar in data ur ett formulär och jämför det med några kriterier som att man måste vara inloggad, inte få göra fler än 3 och inte ha samma namn som tidigare rum. Om alla kriterer möts så läggs rummet bara till i rooms.json. Jag skickar emitterar sedan ett event ner till klienten som med hjälp av samma updateRoomList funtion visar upp det nya meddelandet.
```js
// server.js
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
```

### Gå med i rum

I min render funktion använder jag mig av data-attribut för att lagra både rum id och user id. Detta är för att sockets inte fungerar bra för att behålla data när sidan laddas om när man skickas vidare. Detta gör så att när jag laddat till exempel /chat/testrum så kan jag lätt ta ut testrum, alltså rum idet för att sedan jobba kunna med.

```html
<script src="/client.js" defer data-room-id="${roomId}" data-user-id="${userId}"></script>
```

När man går in på sidor så kollar denna funktionen om sidan man är inne på har ett rum id, vilket bara rummen har och då emitterar det ett event till servern för att gå med i det rummet med sockets. 

```js
// client.js
document.addEventListener("DOMContentLoaded", () => {
    const roomScript = document.querySelector('script[data-room-id]');
    roomId = roomScript ? roomScript.getAttribute("data-room-id") : null;

    if (roomId) {
        clientSocket.emit("join-room", roomId);
    }
});
```

Denna delen är en if else funktion förkortad, om det finns ett attribute att få blir roomId det, annars blir det null
```js
    roomId = roomScript ? roomScript.getAttribute("data-room-id") : null;
```
På servern hanteras det med hjälp av sockets inbyggda funktion socket.join vilket gör att man går med i rummet så alla event dirigerade dit kommer upp för en.

Funktionen hämtar också in chatloggen för rumet. I denna applikationen är det byggt på en enda json fil som hanterar alla rums meddelanden vilket inte är optimalt men fungerar okej för ett sånthär projekt.

Den helt enkelt filtrerar alla meddelanden som har rätt room id läggs in i variablen roomMessages som emittas till klienten där det sedan laddas in. 

Jag har även laggt till ett litet meddelande som skrivs in i chatten bara för användaren som joinas som meddelar den att man har joinat rätt rum. Det har en liten timeout eftersom den är snabbare en load-messages och skulle då hamna längst upp i chatten snarare än längst ner där jag vill ha den.
```js
// server.js
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
```

### Rum hanterare

När man går in på en URL för ett rum så körs funktionen handleRooms. Den hämtar in information om rummet och kollar om rummet faktiskt existerar.

Om rummet har ett lösenord renderas istället en enkel meny där användaren får skriva in lösenordet. Om inget lösenord finns renderas chatten direkt utan några extra steg.
```js
//server.js
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
```

Den här funktionen körs när någon skickar en POST-förfrågan till ``/joinRoom/:roomId``, alltså när lösenordsformuläret skickas in. Att det är en POST är viktigt, det gör att ingen bara kan skriva in adressen direkt och hoppa över lösenordsrutan. Användaren måste gå via formuläret, och jag kan då validera lösenord och andra kriterier som krävs för att få tillgång till privata chattar.

Funktionen kollar att rummet finns, att användaren är inloggad, att lösenord är ifyllt och att det är rätt. Är allt okej visas chatten, annars får användaren ett felmeddelande.

I övrigt liknar funktionen den tidigare – den laddar in och renderar chatten om allt stämmer.

```js
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
```

## Meddelanden

Hela mitt projekt använder en fil, client.js. För att urskilja när funktion ska användas kollar den om dem nedanstående sakerna finns på den nuvarande sidan, då fungerar funktionerna som står inom den. Detta är för att motverka att funktioner i andra delar av projektet råkas påverkas av chat funktionerna.
```js
if (messageInput && chatBox && form) 
```

### pre-loaded

System messages skapar ett meddelande likt dem användare skickar fast har inget username och får en annan klass för att få en snygg stil.
```js
// client.js
    clientSocket.on("system-message", (msg) => {
        const div = document.createElement("div");
        div.classList.add("system-message");
        div.textContent = msg;
        chatBox.append(div);
        chatBox.scrollTop = chatBox.scrollHeight;
    });
```

När jag laddar mina meddelanden så loopar jag ut varje meddelande och kollar om idet på personen som laddar meddelanden har samma id som den som har skickat det för att sedan använda informationen i displat message som jag kommer till senare.
```js
// client.js
    clientSocket.on("load-messages", (messages) => {
        messages.forEach((msg) => {
            const isSender = msg.userId === currentUserId;
            displayMessage(msg, isSender);
        });
    });
```

### Skicka meddelanden

Jag börjar mina meddelanden igenom att bara ta in meddelandet som användaren skrivit in på klienten och emitterar meddelandet och vilket rum det skickades i.
```js
// client.js
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
```

Servern tar emot meddelandet och börjar med att kontrollera att användaren är inloggad. Om den är det hämtas sessiondata och ett unikt ID genereras för meddelandet, tillsammans med användarnamn och användar-ID. Därefter skapas ett objekt som innehåller all denna information, vilket sparas i chatloggen och skickas ut som ett event till alla klienter i det aktuella rummet.
```js
// server.js
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
```

På klienten så tar en funktion emot objektet och åter igen kollar vem som har skickat meddelandet. Sedan visas meddelandet upp med **displayMessage** funktionen
```js
// client.js
   clientSocket.on("get-message", (msg) => {
        if (!currentUserId) {
            console.error("Error: currentUserId is not defined.");
            return;
        }

        const isSender = msg.userId === currentUserId;
        displayMessage(msg, isSender);
    });
```

Funktionen `displayMessage` ansvarar för att visa ett inkommande meddelande i chattgränssnittet. Den skapar HTML-element för att visa användarnamnet och själva meddelandet, samt lägger till ett unikt attribut baserat på meddelandets ID. Beroende på om användaren själv skickat meddelandet eller inte, får meddelandet olika styling. Om det är ett eget meddelande läggs även en meny till via messageMenu. Slutligen läggs meddelandet till i chattrutan och scrollen justeras automatiskt för att alltid visa det senaste meddelandet.
```js
// client.js
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
```

## Message Menu

### Menu
Som jag förklarade i den förra funktionen så läggs messageMenu till om meddelandet är ens egna, denna funktionen skapar en meny knapp som tillåter användaren att båda ta bort och redigera meddelanden. 

Funktionen skapar en ikon som användaren kan klicka på för att få upp knapparna för att redigera. Det mesta i funktionen är stil mässigt men dem viktiga sakerna att fokusera på är eventlistenerna för deleteIcon och editIcon. Dem hämtar in data från meddelandet som dem klickades på och emitterar till servern att något ska redigeras eller tas bort beroende på vilken ikon dem klickade på.
```js
// client.js
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
```

### Delete

När ett delete-message-event tas emot av servern (skickat från en klient som vill ta bort ett meddelande), letar servern först upp det aktuella meddelandet i chatlog.json genom att matcha messageId.

Om inget meddelande hittas avbryts funktionen med ett meddelande i konsolen. Servern kontrollerar också att det är rätt användare som försöker ta bort meddelandet – det vill säga, att userId på meddelandet matchar userId i användarens session. Om det inte är samma, loggas ett fel och inget händer.

Om allt är korrekt filtreras meddelandet bort från chatloggen, filen uppdateras, och ett nytt event `message-deleted` skickas ut till alla användare via io.emit, så att meddelandet försvinner från deras vy också.
```js
// server.js
    socket.on("delete-message", ({ messageId }) => {
        let chatlog = getJson("chatlog");
        let SelectedMessage = chatlog.find((msg) => msg.messageId === messageId);

        if (!SelectedMessage) return console.log("Message not found");
        if (SelectedMessage.userId !== socket.request.session.userId) return console.log("You are not the sender of this message");

        chatlog = chatlog.filter((msg) => msg.messageId !== messageId);
        fs.writeFileSync(__dirname + "/data/chatlog.json", JSON.stringify(chatlog, null, 3));
        io.emit("message-deleted", { messageId });
    });
```

På klient sidan tas diven bara bort för att uppdatera direkt, den är redan borta på servern så den syns inte om sidan laddas om.

 ```js
 // client.js
     clientSocket.on("message-deleted", ({ messageId }) => {
        const messageDiv = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageDiv) {
            messageDiv.remove();
        }
    });
 ```

### Edit

Funktionen för att redigera meddelanden tillåter användaren att ändra innehållet i sina egna meddelanden. Den består av både klient- och serverlogik för att säkerställa att endast den ursprungliga avsändaren kan redigera ett meddelande.

#### Klient

När användaren klickar på redigeringsikonen (`editIcon`) i meddelandemenyn, aktiveras redigeringsläget. Detta görs genom att ersätta det befintliga meddelandet med ett formulär som innehåller ett textfält för att redigera meddelandet.

```js
// client.js
function editMode(messageId, parentDiv) {
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

    console.log(parentDiv);
    console.log(messageId);
    console.log(message);
}
```

1. **Hämta meddelandetext**: Funktionen hämtar det aktuella meddelandetexten från `parentDiv` och separerar användarnamnet från själva meddelandet.
2. **Skapa redigeringsformulär**: Ett formulär med ett textfält skapas och fylls med det befintliga meddelandet.
3. **Ersätt meddelandet**: Det ursprungliga meddelandet ersätts med redigeringsformuläret.
4. **Hantering av formulärinlämning**: När användaren skickar in det nya meddelandet, skickas det till servern via `clientSocket.emit`. Om textfältet är tomt visas ett felmeddelande.

#### Server

Servern tar emot redigeringsförfrågan och kontrollerar att användaren som skickade förfrågan är samma användare som ursprungligen skickade meddelandet. Om detta stämmer, uppdateras meddelandet i `chatlog.json` och ett event skickas till alla klienter för att uppdatera meddelandet.

```js
// server.js
socket.on("edit-message", ({ messageId, newMessage }) => {
    let chatlog = getJson("chatlog");
    let SelectedMessage = chatlog.find((msg) => msg.messageId === messageId);

    if (!SelectedMessage) return console.log("Message not found");
    if (SelectedMessage.userId !== socket.request.session.userId) {
        io.emit("error-message", "You are not the sender of this message");
        return;
    }

    SelectedMessage.message = newMessage;
    fs.writeFileSync(__dirname + "/data/chatlog.json", JSON.stringify(chatlog, null, 3));
    io.emit("message-edited", { messageId, newMessage });
});
```

1. **Hitta meddelandet**: Servern letar upp meddelandet i `chatlog.json` baserat på `messageId`.
2. **Kontrollera användarbehörighet**: Servern kontrollerar att användaren som försöker redigera meddelandet är samma användare som skickade det.
3. **Uppdatera meddelandet**: Om användaren är behörig, uppdateras meddelandet i `chatlog.json`.
4. **Emit event**: Ett `message-edited`-event skickas till alla klienter för att uppdatera meddelandet i realtid.

#### Klientuppdatering

När klienten tar emot `message-edited`-eventet, uppdateras meddelandet i gränssnittet.

```js
// client.js
clientSocket.on("message-edited", ({ messageId, newMessage }) => {
    const messageDiv = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageDiv) {
        const messageSpan = messageDiv.querySelector(".message");
        messageSpan.textContent = newMessage;
    }
});
```

1. **Hitta meddelandet**: Klienten letar upp meddelandet i DOM baserat på `messageId`.
2. **Uppdatera texten**: Meddelandets text ersätts med den nya texten.

