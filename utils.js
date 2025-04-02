const fs = require("fs");

function render(content = " ", req) {
    let html = fs.readFileSync(__dirname + "/views/template.html").toString();
    html = html.replace("**content**", content)
    html = html.replace("**header**", loggedInHeader(req.session.auth))
    return html;
}
function getJson(filename) {
    let json = JSON.parse(fs.readFileSync(__dirname + "/data/" + filename + ".json").toString());
    return json;
}

function showChat(roomId, userId) {

    return`
    <button id="menuToggle" class="hamburger">&#9776;</button> 
    <div>
        <div id="roomList" class="chatMenu">
            <button id="menuToggleInside" class="hamburger">&#9776;</button> 
            <div class="roomItems"></div> 
        </div>
        <div class="chatContainer">
            <div id="chat"></div>
            <div class="chatSubmit">
                <form id="chatForm">
                    <input type="text" autocomplete="off" name="message" id="chatInput">
                    <input type="submit" value="Send">
                </form>
            </div>
        </div>
    </div>
    <script src="/client.js" defer data-room-id="${roomId}" data-user-id="${userId}"></script>
`
}

function loggedInHeader(LoggedIn){
    if(LoggedIn){
        return`
            <a href="/createRoom">Skapa rum</a>
            <a href="/logout">Logout</a>
            <a id="profileIcon" href="/profile"></a>

            
        `
    }
    else{
        return`
            <a href="/register">Registrera</a>
            <a href="/login">Logga in</a>
        `
    }
    
}






module.exports = { render, getJson, showChat };