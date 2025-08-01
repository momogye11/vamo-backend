require('dotenv').config();
const axios = require('axios');

async function verifyPhoneNumber(phone) {
    try {
        const response = await axios.get('http://apilayer.net/api/validate', {
            params: {
                access_key: process.env.NUMVERIFY_API_KEY,
                number: phone,
                format: 1
            }
        });

        // Log pour développement (à désactiver en prod)
        console.log("🔍 Numverify:", response.data);

        return response.data;
    } catch (error) {
        console.error('❌ Erreur Numverify :', error.message);
        return null;
    }
}

module.exports = verifyPhoneNumber;
