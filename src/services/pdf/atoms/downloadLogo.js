const https = require("https");

module.exports = async function downloadLogo(url) {
  if (!url) return null;
  return new Promise((resolve) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        console.error(`Failed to download logo: status code ${res.statusCode}`);
        return resolve(null);
      }
      const data = [];
      res.on("data", (chunk) => data.push(chunk));
      res.on("end", () => resolve(Buffer.concat(data)));
      res.on("error", (err) => {
        console.error("Error downloading logo stream:", err);
        resolve(null);
      });
    }).on("error", (err) => {
      console.error("Error downloading logo:", err);
      resolve(null);
    });
  });
};
