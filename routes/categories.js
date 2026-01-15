// routes/categories.js
const express = require('express');
const router = express.Router();
const mongoService = require('../services/mongoService');
const multiChainAnalyzer = require('../services/multiChainAnalyzer');

router.get('/categories', async (req, res) => {
    try {
        const categories = await cacheService.getCategories();
        res.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

module.exports = router;