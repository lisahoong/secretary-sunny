const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI);

const userSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: true
    },
    slackId: {
        type: String,
        required: true
    },
    slackName: {
        type: String,
        required: true
    },
    slackDmChannelId: String,
    google: Object,
    email: String,
    pending: String
})

const User = mongoose.model('User', userSchema);

module.exports = {
    User
}
