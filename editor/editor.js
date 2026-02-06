const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const cutline = document.getElementById("cutline");
const btnSquare = document.getElementById("btnSquare");
const btnCircle = document.getElementById("btnCircle");

let shape = "square";     // square | circle
let img = null;

function setShape(next){
  shape = next;

  btnSquare.classList.toggle("active", shape === "square");
  btnCircle.classList.toggle("active", shape === "circle");

  // Linia cięcia: kwadrat z rogami vs okrąg
  if (shape === "circle"){
    cutline.style.borderRadius = "50%";
  } else {
    cutline.style.borderRadius = "12px";
  }

  draw();
}

btnSquare.addEventListener("click", () => setShape("square"));
btnCircle.addEventListener("click", () => setShape("circle"));

document.getElementById("upload").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const im = new Image();
    im.onload = () => { img = im; draw(); };
    im.src = reader.result;
  };
  reader.readAsDataURL(file);
});

function draw(){
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // tło
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!img) return;

  ctx.save();

  // maska podglądu kształtu (tylko dla widoku)
  if (shape === "circle"){
    ctx.beginPath();
    ctx.arc(500, 500, 500, 0, Math.PI * 2);
    ctx.clip();
  }

  // Prosty „cover” na całą 10x10
  const cw = canvas.width, ch = canvas.height;
  const ir = img.width / img.height;
  const cr = cw / ch;

  let dw, dh, dx, dy;
  if (ir > cr){
    dh = ch;
    dw = ch * ir;
    dx = (cw - dw) / 2;
    dy = 0;
  } else {
    dw = cw;
    dh = cw / ir;
    dx = 0;
    dy = (ch - dh) / 2;
  }

  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

// start
setShape("square");
