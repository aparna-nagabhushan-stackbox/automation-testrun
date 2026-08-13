require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRoutes = require('./routes/auth');
const inviteRoutes = require('./routes/invites');
const projectRoutes = require('./routes/projects');
const teamRoutes = require('./routes/team');
const recorderRoutes = require('./routes/recorder');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/recorder', recorderRoutes);

// Serve the dashboard itself. Any path (including "/?invite=..." style
// links) falls through to index.html since this is a single-page file.
app.use(express.static(path.join(__dirname, '..'), { index: 'index.html' }));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`StackTest server running on http://localhost:${PORT}`);
});
