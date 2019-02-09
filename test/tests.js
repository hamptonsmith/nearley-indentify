process.on("unhandledRejection", (reason, p) => {
    console.log("Unhandled Rejection at:", p, "reason:", reason);
    // Application specific logging, throwing an error, or other logic here
});

require("./tokenization-tests");
require("./other-tests");

global.sbtest.sequence.then(() => {
    global.sbtest.resultHandler.finalize();
});
