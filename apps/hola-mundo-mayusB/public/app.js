const form = document.getElementById("form");
const input = document.getElementById("textInput");
const output = document.getElementById("output");

form.addEventListener("submit", (e) => {
  e.preventDefault();

  const text = input.value.trim();
  output.textContent = text.toUpperCase();
});