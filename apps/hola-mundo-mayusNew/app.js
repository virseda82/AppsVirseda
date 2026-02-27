const form = document.getElementById("form");
const input = document.getElementById("textInput");
const output = document.getElementById("output");

form.addEventListener("submit", (e) => {
  e.preventDefault();
  output.textContent = input.value.trim().toUpperCase();
});