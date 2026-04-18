require("dotenv/config");
const app = require("./src/app");

const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
