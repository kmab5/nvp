const body = document.querySelector("body");
const big_labels = document.querySelectorAll(".big");
const small_labels = document.querySelectorAll(".small");
const cpu_label = document.querySelector(".cpu");
const vscpu = document.querySelector("#new_game_1");
const pvp = document.querySelector("#new_game_2");
const guesses = document.querySelector(".guesses");
const p1input = document.querySelector("#p1guess");
const p1btn = document.querySelector("#p1done");
const p2input = document.querySelector("#p2guess");
const p2btn = document.querySelector("#p2done");
const theme = document.querySelector("#theme");
const rules = document.querySelector("#rules");
const menu = document.querySelector("#menu");
var cpu = false;
var color_mode = 0;

var player1 = {};
var player2 = {};


window.onload = () => {
    if(window.innerWidth < 520){
        big_labels.forEach(label => label.classList.add("disabled"));
    } else {
        small_labels.forEach(label => label.classList.add("disabled"));
    }

    if(!cpu){
        cpu_label.classList.add("disabled");
    }

    if(window.innerWidth < 480){
        document.querySelector(".nav").classList.add("drop");
        document.querySelector(".nav").classList.remove("full");
        document.querySelector(".dropdown").style.setProperty("display", "flex");
    }else{
        document.querySelector(".nav").classList.add("full");
        document.querySelector(".nav").classList.remove("drop");
        document.querySelector(".dropdown").style.setProperty("display", "none");
    }

    document.querySelector(".container").style.setProperty("height", window.innerHeight);
};

window.addEventListener('resize', e => {
    if(window.innerWidth < 520){
        big_labels.forEach(label => label.classList.add("disabled"));
        small_labels.forEach(label => label.classList.remove("disabled"));
    }else{
        big_labels.forEach(label => label.classList.remove("disabled"));
        small_labels.forEach(label => label.classList.add("disabled"));
    }

    if(window.innerWidth < 480) {
        document.querySelector(".nav").classList.add("drop");
        document.querySelector(".dropdown").style.setProperty("display", "flex");
    }else{
        document.querySelector(".nav").classList.remove("drop");
        document.querySelector(".dropdown").style.setProperty("display", "none");
    }

    document.querySelector(".container").style.setProperty("height", window.innerHeight);
    console.log(window.innerWidth);
});

menu.addEventListener("click", e => {
    if(document.querySelector(".nav").classList.contains("dropped")){
        document.querySelector(".nav").classList.remove("dropped");
        menu.src = "./assets/menu_"+ color_mode +".png";
    }else{
        document.querySelector(".nav").classList.add("dropped");
        menu.src = "./assets/cross_"+ color_mode +".png";
    }
});

p1btn.addEventListener("mouseover", e => p1btn.classList.add("active"));
p1btn.addEventListener("mouseout", e => p1btn.classList.remove("active"));
p2btn.addEventListener("mouseover", e => p2btn.classList.add("active"));
p2btn.addEventListener("mouseout", e => p2btn.classList.remove("active"));

const colors = [
    ["var(--dark)", "var(--primary-light)", "var(--primary-container-dark)", "var(--light)", "var(--primary-container-light)", "var(--dark-container)", "var(--primary-dark)", "var(--light-container)"],
    ["var(--light)", "var(--primary-dark)", "var(--primary-container-light)", "var(--dark)", "var(--primary-container-dark)", "var(--light-container)", "var(--primary-light)", "var(--dark-container)"]
];

function colorUpdate(mode){ // 0 - Light, 1 - Dark
    color_mode = mode;
    document.querySelector(".container").style.setProperty("color", colors[mode][0]);
    document.querySelector(".container").style.setProperty("background-color", colors[mode][1]);
    document.querySelector(".game").style.setProperty("color", colors[mode][0]);
    document.querySelector(".game").style.setProperty("background-color", colors[mode][2]);
    document.querySelectorAll("button").forEach(but => but.style.setProperty("color", colors[mode][3]));
    document.querySelectorAll("button").forEach(but => but.style.setProperty("background-color", colors[mode][4]));
    document.querySelector(".nav").style.setProperty("color", colors[mode][0]);
    document.querySelector(".nav").style.setProperty("background-color", colors[mode][7]);
    document.querySelectorAll(".link").forEach(link => link.style.setProperty("color", colors[mode][5]));
    document.querySelectorAll(".tab").forEach(tab => tab.style.setProperty("border-bottom", `0.08rem solid ${colors[mode][0]}`));
    menu.src = menu.src.toString().substring(0, (menu.src.toString().length - 5)) + mode.toString() + ".png";
}

theme.addEventListener("change", e => {
    if(theme.checked) {
        console.log("Light Mode");
        colorUpdate(0);
    }else{
        console.log("Dark Mode");
        colorUpdate(1);
    }
});

function check_number(num){
    if(num.length != 4) return false;
    if((/[^1-9]/g).test(num)) return false;
    if((/([1-9]+)(?=.*\1)/gm).test(num)) return false;
    return true;
}


function update(){
    var guess_string = "";
    for(let i = 0; i < Math.max(player1.guesses.length, player2.guesses.length); i++){
        let p1guess = player1.guesses[i] || "<span class='text'>No Guess</span>", 
            p1value = player1.values[i] || "<span class='text'>Not Evaluated</span>", 
            p1position = player1.positions[i] || "<span class='text'>Not Evaluated</span>", 
            p2guess = player2.guesses[i] || "<span class='text'>No Guess</span>", 
            p2value = player2.values[i] || "<span class='text'>Not Evaluated</span>", 
            p2position = player2.positions[i] || "<span class='text'>Not Evaluated</span>";
        guess_string += `<div class="number tab" id="n${i+1}p1">${p1guess}</div><div class="value tab" id="v${i+1}p1">${p1value}</div><div class="position tab" id="p${i+1}p1">${p1position}</div><div class="number tab" id="n${i+1}p2">${p2guess}</div><div class="value tab" id="v${i+1}p2">${p2value}</div><div class="position tab" id="p${i+1}p2">${p2position}</div>`;
    }
    guesses.innerHTML = guess_string;
}


function tooltip(info, play = 0){
    if(info == 1){
        let wrapper = document.createElement("div");
        let bg = document.createElement("div");
        let head = document.createElement("div");
        let info = document.createElement("div");
        let close = document.createElement("button");
        wrapper.classList.add("tooltip");
        wrapper.classList.add("wrapper");
        bg.classList.add("tooltip");
        bg.classList.add("bg");
        head.classList.add("tooltip");
        head.classList.add("head");
        info.classList.add("tooltip");
        info.classList.add("info");
        close.classList.add("tooltip");
        close.classList.add("close");
        close.addEventListener("click", e => close_tooltip(1));

        head.innerText = "Rules";
        info.innerText = "Rule #1: Use only numbers from 1 up to 9, do NOT use 0\nRule #2: Do NOT repeat numbers\nRule #3: That's it! Have fun!";
        close.innerText = "Done";

        bg.appendChild(head);
        bg.appendChild(info);
        bg.appendChild(close);

        wrapper.appendChild(bg);

        body.appendChild(wrapper);
    }else if(info == 2){
        let wrapper = document.createElement("div");
        let bg = document.createElement("div");
        let head = document.createElement("div");
        let info = document.createElement("div");
        let user_input = document.createElement("input");
        let close = document.createElement("button");
        wrapper.classList.add("tooltip");
        wrapper.classList.add("wrapper");
        bg.classList.add("tooltip");
        bg.classList.add("bg");
        head.classList.add("tooltip");
        head.classList.add("head");
        info.classList.add("tooltip");
        info.classList.add("info");
        user_input.classList.add("tooltip");
        user_input.classList.add("box");
        user_input.classList.add("text");
        close.classList.add("tooltip");
        close.classList.add("close");

        user_input.type = "password";
        user_input.name = "password";
        user_input.id = "password";

        close.addEventListener("click", e => close_tooltip(2, play));

        if(play == 1){
            head.innerText = "Player 1";
            info.innerText = "Enter your number!\nRule #1: Use only numbers from 1 up to 9, do NOT use 0\nRule #2: Do NOT repeat numbers\nRule #3: That's it! Have fun!";
        }else{
            head.innerText = "Player 2";
            info.innerText = "Enter your number!\nRule #1: Use only numbers from 1 up to 9, do NOT use 0\nRule #2: Do NOT repeat numbers\nRule #3: That's it! Have fun!";
        }
        

        close.innerText = "Done";

        bg.appendChild(head);
        bg.appendChild(info);
        bg.appendChild(user_input);
        bg.appendChild(close);

        wrapper.appendChild(bg);

        body.appendChild(wrapper);
    }else if(info == 3){
        let wrapper = document.createElement("div");
        let bg = document.createElement("div");
        let head = document.createElement("div");
        let info = document.createElement("div");
        let close = document.createElement("button");
        wrapper.classList.add("tooltip");
        wrapper.classList.add("wrapper");
        bg.classList.add("tooltip");
        bg.classList.add("bg");
        head.classList.add("tooltip");
        head.classList.add("head");
        info.classList.add("tooltip");
        info.classList.add("info");
        close.classList.add("tooltip");
        close.classList.add("close");
        close.addEventListener("click", e => close_tooltip(1));

        head.innerText = "Error";
        info.innerText = "You have made an error when you inputted. Please check the rules at the bottom of the page and try again.";
        close.innerText = "Got it!";

        bg.appendChild(head);
        bg.appendChild(info);
        bg.appendChild(close);

        wrapper.appendChild(bg);

        body.appendChild(wrapper);
    }else if(info == 4){
        let wrapper = document.createElement("div");
        let bg = document.createElement("div");
        let head = document.createElement("div");
        let info = document.createElement("div");
        let close = document.createElement("button");
        wrapper.classList.add("tooltip");
        wrapper.classList.add("wrapper");
        bg.classList.add("tooltip");
        bg.classList.add("bg");
        head.classList.add("tooltip");
        head.classList.add("head");
        info.classList.add("tooltip");
        info.classList.add("info");
        close.classList.add("tooltip");
        close.classList.add("close");
        close.addEventListener("click", e => close_tooltip(1));

        head.innerText = "Game Over!";
        info.innerText = `Congrats Player ${play}! You Guessed Correctly! To play again, choose from the Navigation Bar at the top!`;
        close.innerText = "YAY!";

        bg.appendChild(head);
        bg.appendChild(info);
        bg.appendChild(close);

        wrapper.appendChild(bg);

        body.appendChild(wrapper);
    }else if(info == 5){
        let wrapper = document.createElement("div");
        let bg = document.createElement("div");
        let head = document.createElement("div");
        let info = document.createElement("div");
        let close = document.createElement("button");
        wrapper.classList.add("tooltip");
        wrapper.classList.add("wrapper");
        bg.classList.add("tooltip");
        bg.classList.add("bg");
        head.classList.add("tooltip");
        head.classList.add("head");
        info.classList.add("tooltip");
        info.classList.add("info");
        close.classList.add("tooltip");
        close.classList.add("close");
        close.addEventListener("click", e => close_tooltip(1));

        head.innerText = "Game Over!";
        info.innerText = `ITS A TIE! Wow, what a game! Your mental prowess (or luck) is equal to that of eachother! Better luck next time!`;
        close.innerText = "Let's do it again!";

        bg.appendChild(head);
        bg.appendChild(info);
        bg.appendChild(close);

        wrapper.appendChild(bg);

        body.appendChild(wrapper);
    }
}

function close_tooltip(inp, play=0){
    if(inp != 1){
        if(!check_number(document.querySelector("#password").value)) return;
        if(play == 1){
            player1.number = document.querySelector("#password").value;
            document.querySelector(".tooltip.wrapper").remove();
            tooltip(2, 2);
            return;
        }else if(play == 2){
            player2.number = document.querySelector("#password").value;
            document.querySelector(".tooltip.wrapper").remove();
            return;
        }
    }
    document.querySelector(".tooltip.wrapper").remove();
}

rules.addEventListener("click", e => tooltip(1));

function newgame(mode){
    tooltip(2, 1);
    p1input.innerHTML = "Player 1 Guess";
    p2input.innerHTML = "Player 2 Guess";
    if(mode == 1){
        cpu = true;
        p2input.setAttribute("contenteditable", false);
        if(!p2btn.hasAttribute("disabled")) p2btn.toggleAttribute("disabled");
    } else if(mode == 2){
        cpu = false;
        p2input.setAttribute("contenteditable", true);
        p2btn.removeAttribute("disabled");
    }
    player1 = {
        number: "",
        guesses: [],
        values: [],
        positions: []
    };
    player2 = {
        number: "",
        guesses: [],
        values: [],
        positions: []
    };
    update();
}

// Add a CPU **

// make the menu option for phones

function guessed(player){
    if(player == 1){
        if(!check_number(p1input.innerHTML)) return tooltip(3);
        player1.guesses.push(p1input.innerHTML);
        p1btn.toggleAttribute("disabled");
        update();
        if(p2btn.hasAttribute("disabled")) {
            // console.groupCollapsed("Guessed");
            // console.log("Evaluating");
            evaluate();
            p1btn.removeAttribute("disabled");
            p2btn.removeAttribute("disabled");
        }
    }else{
        if(!check_number(p2input.innerHTML)) return tooltip(3);
        player2.guesses.push(p2input.innerHTML);
        p2btn.toggleAttribute("disabled");
        update();
        if(p1btn.hasAttribute("disabled")) {
            // console.groupCollapsed("Guessed");
            // console.log("Evaluating");
            evaluate();
            p1btn.removeAttribute("disabled");
            p2btn.removeAttribute("disabled");
        }
    }
}

function evaluate(){
    let p1n = player1.number;
    let p2g = player2.guesses[player2.guesses.length - 1];
    let p2n = player2.number;
    let p1g = player1.guesses[player1.guesses.length - 1];
    // console.log(`P1 Number: ${p1n}\nP2 Guess: ${p2g}\nP2 Number: ${p2n}\nP1 Guess: ${p1g}\n`);
    let p1v = 0, p1p = 0, p2v = 0, p2p = 0;
    for(let i = 0; i < 4; i++){
        if(p2n.includes(p1g[i])){
            p1v++;
            if(p1g[i] == p2n[i]) p1p++;
        }
        if(p1n.includes(p2g[i])){
            p2v++;
            if(p2g[i] == p1n[i]) p2p++;
        }
    }
    player1.values.push(p1v.toString());
    player2.values.push(p2v.toString());
    player1.positions.push(p1p.toString());
    player2.positions.push(p2p.toString());
    // console.table({
        // "P1 Value": p1v,
        // "P1 Position": p1p,
        // "P2 Value": p2v,
        // "P2 Position": p2p
    // });
    // console.log("Evaluated");
    // console.groupEnd();
    update();
    if(p1n == p2g){
        if(p2n == p1g){
            gameover(5);
            return;
        }
        gameover(4, 2);
    }else if(p2n == p1g){
        gameover(4, 1);
    }
}

// state = 4 - win, 5 - tie
// play = 1 - player 1 win
// play = 2 - player 2 win

function gameover(state, play=0){
    // console.log(`State: ${state}`);
    tooltip(state, play);
}

newgame(2);

vscpu.addEventListener("click", e => newgame(1));
pvp.addEventListener("click", e => newgame(2));