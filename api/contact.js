const nodemailer = require('nodemailer');

const LIMITS = {
  name: 100,
  email: 150,
  phone: 50,
  message: 3000
};

function clean(value) {
  return String(value || '')
    .replace(/\0/g, '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateLength(field, value, errors) {
  if (value.length > LIMITS[field]) {
    errors.push(`${field} ist zu lang.`);
  }
}

function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const body = getBody(req);
  const honeypot = clean(body.website);
  if (honeypot) {
    return res.status(200).json({ success: true });
  }

  const data = {
    name: clean(body.name),
    email: clean(body.email).toLowerCase(),
    phone: clean(body.phone),
    message: clean(body.message),
    source: clean(body.source) || 'Kontaktformular Website',
    submittedAt: clean(body.submitted_at) || new Date().toISOString(),
    dsgvo: body.dsgvo === true || body.dsgvo === 'true' || body.dsgvo === 'akzeptiert'
  };

  const errors = [];
  if (!data.name) errors.push('Name fehlt.');
  if (!data.email || !isValidEmail(data.email)) errors.push('E-Mail-Adresse ist ungültig.');
  if (!data.message) errors.push('Nachricht fehlt.');
  if (!data.dsgvo) errors.push('DSGVO-Zustimmung fehlt.');
  validateLength('name', data.name, errors);
  validateLength('email', data.email, errors);
  validateLength('phone', data.phone, errors);
  validateLength('message', data.message, errors);

  if (errors.length) {
    return res.status(400).json({ success: false, message: 'Invalid input' });
  }

  try {
    const smtpHost = requireEnv('SMTP_HOST');
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    const smtpUser = requireEnv('SMTP_USER');
    const smtpPass = requireEnv('SMTP_PASS');
    const contactTo = requireEnv('CONTACT_TO');
    const contactFrom = process.env.CONTACT_FROM || smtpUser;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    const text = [
      'Neue Anfrage über anchaya-thai-massage.de',
      '',
      `Name: ${data.name}`,
      `E-Mail: ${data.email}`,
      `Telefon: ${data.phone || 'nicht angegeben'}`,
      '',
      'Nachricht:',
      data.message,
      '',
      `Zeitpunkt: ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`,
      `Quelle: ${data.source}`
    ].join('\n');

    await transporter.sendMail({
      from: `"ANCHAYA THAI MASSAGE Website" <${contactFrom}>`,
      to: contactTo,
      replyTo: data.email,
      subject: 'Neue Anfrage über anchaya-thai-massage.de',
      text
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Contact form delivery failed:', error);
    return res.status(500).json({ success: false, message: 'Mail delivery failed' });
  }
};
