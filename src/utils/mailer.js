const nodeMailer = require("nodemailer");
const sgMail = require("@sendgrid/mail");

async function sendEmail(options) {
  try {


    if (!process.env.SMTP_HOST || 
        !process.env.SMTP_PORT || 
        !process.env.SMTP_USER || 
        !process.env.SMTP_PASS) {
      throw new Error("SMTP configuration is missing");
    }

    const transporter = nodeMailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const mailOptions = {
      from: `Service Info <${process.env.SMTP_USER}>`,
      to: options.mail,
      subject: options.subject,
      text: options.content,
      html: options.html || undefined
    };

    // Support for attachments
    if (options.attachments && Array.isArray(options.attachments)) {
      mailOptions.attachments = options.attachments;
    }

    console.log("📧 Sending via Nodemailer...");
    return await transporter.sendMail(mailOptions);

  } catch (error) {

    console.error("❌ Nodemailer failed:", error.message);
  

    try {
      console.log("🔄 Trying SendGrid fallback...");

      if (!process.env.SENDGRID_API_KEY) {
        throw new Error("SendGrid API key missing");
      }

      sgMail.setApiKey(process.env.SENDGRID_API_KEY);

      const msg = {
        to: options.mail,
        from: process.env.SMTP_USER,
        subject: options.subject,
        text: options.content,
        html: options.html || undefined
      };

      // SendGrid supports attachments as well
      if (options.attachments && Array.isArray(options.attachments)) {
        msg.attachments = options.attachments.map(att => ({
          content: att.content.toString('base64'),
          filename: att.filename,
          type: att.contentType || 'application/octet-stream',
          disposition: 'attachment'
        }));
      }

      return await sgMail.send(msg);

    } catch (fallbackError) {
      console.error("❌ Fallback failed:", fallbackError.message);
      throw new Error("All email services failed");
    }
  }
}

module.exports = sendEmail;