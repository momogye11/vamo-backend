const express = require('express');
const router = express.Router();

router.get('/test', (req, res) => {
    res.json({ message: 'Simple places API working!' });
});

module.exports = router;