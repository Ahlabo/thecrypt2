const fs = require("fs");
const crypto = require('crypto');
function render(content = " ") {
    let html = fs.readFileSync(__dirname + "/views/template.html").toString();
    html = html.replace("**content**", content)
    return html;
}
function getJson(filename) {
    let json = JSON.parse(fs.readFileSync(__dirname + "/data/" + filename + ".json").toString());
    return json;
}

function getHTML(filename) {
    let html = fs.readFileSync(__dirname + "/view/" + filename + ".html").toString();
    return html;
}
function saveMessage(message) {
    fs.writeFileSync(__dirname + "/data/chatlog.json", JSON.stringify(message, null, 3));
    return true;
}




module.exports = { render, getJson, getHTML, saveMessage }