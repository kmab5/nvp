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
var cpu = false;

var player1 = {};
var player2 = {};


window.onload = () => {
    if(window.innerWidth < 480){
        big_labels.forEach(label => label.classList.add("disabled"));
    } else {
        small_labels.forEach(label => label.classList.add("disabled"));
    }

    if(!cpu){
        cpu_label.classList.add("disabled");
    }

    document.querySelector(".container").style.setProperty("height", window.innerHeight);
};

window.addEventListener('resize', e => {
    if(window.innerWidth < 480){
        big_labels.forEach(label => label.classList.add("disabled"));
        small_labels.forEach(label => label.classList.remove("disabled"));
    }else{
        big_labels.forEach(label => label.classList.remove("disabled"));
        small_labels.forEach(label => label.classList.add("disabled"));
    }
    document.querySelector(".container").style.setProperty("height", window.innerHeight);
    console.log(window.innerWidth);
});

function update(){
    var guess_string = "";
    for(let i = 0; i < Math.max(player1.guesses.length, player2.guesses.length); i++){
        let p1guess = player1.guesses[i] || "<span class='text'>No Guess</span>", 
            p1value = player1.values[i] || "<span class='text'>Not Evaluated</span>", 
            p1position = player1.positions[i] || "<span class='text'>Not Evaluated</span>", 
            p2guess = player2.guesses[i] || "<span class='text'>No Guess</span>", 
            p2value = player2.values[i] || "<span class='text'>Not Evaluated</span>", 
            p2position = player2.positions[i] || "<span class='text'>Not Evaluated</span>";
        guess_string += `<div class="number" id="n${i+1}p1">${p1guess}</div><div class="value" id="v${i+1}p1">${p1value}</div><div class="position" id="p${i+1}p1">${p1position}</div><div class="number" id="n${i+1}p2">${p2guess}</div><div class="value" id="v${i+1}p2">${p2value}</div><div class="position" id="p${i+1}p2">${p2position}</div>`;
    }
    guesses.innerHTML = guess_string;
}


function newgame(mode){
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
        guesses: [1234, 2546],
        values: [2, 5],
        positions: [5, 5]
    };
    player2 = {
        guesses: [5641],
        values: [3],
        positions: [5]
    };
    update();
}

// Check for the rules in the guessed function

// Add a functionality that disables the utton after guessing waiting for the other player

// Add a CPU **

// make the evaluate function

// Prepare the rules popup


function guessed(player){
    if(player == 1){
        player1.guesses.push(parseInt(p1input.innerHTML));
    }else{
        player2.guesses.push(parseInt(p2input.innerHTML));
    }
    update();
    console.table(player1);
    console.table(player2);
}

function evaluate(){

}

function gameover(){

}

newgame(2);

vscpu.addEventListener("click", e => newgame(1));
pvp.addEventListener("click", e => newgame(2));

