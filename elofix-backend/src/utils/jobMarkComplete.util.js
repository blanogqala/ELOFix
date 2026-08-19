const AppError = require("./AppError");

const ALREADY_AWAITING_CONFIRMATION_MSG = "Already waiting for customer confirmation.";

function assertNotAlreadyAwaitingConfirmation(frontendStatus) {
  if (String(frontendStatus || "").toUpperCase() === "AWAITING_CONFIRMATION") {
    throw new AppError(ALREADY_AWAITING_CONFIRMATION_MSG, 400);
  }
}

module.exports = {
  ALREADY_AWAITING_CONFIRMATION_MSG,
  assertNotAlreadyAwaitingConfirmation,
};
