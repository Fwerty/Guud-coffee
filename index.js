// index.js
const express = require("express");
const app = express();

// Port Railway otomatik atıyor, yoksa 3000 kullan
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("try change");
});

// guncelle

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
