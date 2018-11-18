const { EMAIL_CONFIG: { options, transport } } = require('../config/env');
const { createTransport } = require('nodemailer');

class MailService {
  constructor() {
    this.transport = createTransport(transport);
  }

  send({ from, to, subject, text}) {
    return this.transport.sendMail({
      ...options,
      from,
      to,
      subject,
      text
    });
  }
}

module.exports = new MailService();
