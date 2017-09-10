const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI);

const userSchema = new mongoose.Schema({
    firstName: {
        type: String,
        required: true
    },
    lastName: {
        type: String,
        required: true
    },
    fbUserId: {
        type: String,
        required: true
    },
    google: Object,
    spotify: Object,
    email: String,
    pending: Object,
    currentReminder: Object
})

const User = mongoose.model('User', userSchema);

module.exports = {
    User
}
