require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const twilio = require('twilio');
const schedule = require('node-schedule');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Twilio credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

// Database connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
const Reminder = mongoose.model('Reminder', {
  phone: String,
  message: String,
  time: Date,
  recurring: String, // "daily", "weekly", "monthly", or null
});

app.get('/', (req, res) => {
  res.send('WhatsApp Reminder Bot is running!');
});

app.post('/webhook', async (req, res) => {
  const messageBody = req.body.Body.toLowerCase();
  const from = req.body.From;

  if (messageBody.startsWith('remind me')) {
    const reminderDetails = parseReminder(messageBody);
    if (!reminderDetails) {
      return res.send(createTwilioResponse('Sorry, I couldn’t understand that. Use: "Remind me to [task] at [time]."'));
    }

    const { message, time, recurring } = reminderDetails;
    const reminder = new Reminder({ phone: from, message, time, recurring });
    await reminder.save();

    scheduleReminder(reminder);

    return res.send(createTwilioResponse(`Got it! I'll remind you to "${message}" at ${time}.`));
  }

  res.send(createTwilioResponse('Hi! Send "Remind me to [task] at [time]" to set a reminder.'));
});

function parseReminder(message) {
  const match = message.match(/remind me to (.+) at (\d{1,2}:\d{2} ?(am|pm)?) ?(daily|weekly|monthly)?/);
  if (!match) return null;

  const [_, task, time, , recurring] = match;
  const date = new Date();
  const [hours, minutes] = time.split(':');
  date.setHours(parseInt(hours) + (time.includes('pm') ? 12 : 0), parseInt(minutes), 0);

  return { message: task, time: date, recurring };
}

function scheduleReminder(reminder) {
  const { phone, message, time, recurring } = reminder;

  const job = schedule.scheduleJob(time, async () => {
    await client.messages.create({
      from: 'whatsapp:+14155238886', // Your Twilio sandbox number
      to: phone,
      body: `Reminder: ${message}`,
    });

    if (recurring === 'daily') time.setDate(time.getDate() + 1);
    else if (recurring === 'weekly') time.setDate(time.getDate() + 7);
    else if (recurring === 'monthly') time.setMonth(time.getMonth() + 1);

    if (recurring) scheduleReminder(reminder);
  });

  return job;
}

function createTwilioResponse(message) {
  return `<Response><Message>${message}</Message></Response>`;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
