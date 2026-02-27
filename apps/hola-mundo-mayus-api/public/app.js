const form = document.getElementById("form");
const input = document.getElementById("textInput");
const output = document.getElementById("output");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  output.textContent = "Procesando...";

  try {
    const resp = await fetch("/api/uppercase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: input.value }),
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();
    output.textContent = data.upper;
  } catch (err) {
    output.textContent = "Error llamando a la API";
    console.error(err);
  }
});