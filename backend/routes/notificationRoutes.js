// backend/routes/notificationRoutes.js

const express = require('express');
const router = express.Router();

// ✅ Import Supabase client directly from config
const { supabaseAdmin } = require('../config/database');

// ─── Auth Middleware ──────────────────────────────────────────────────────────
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }
    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = { id: decoded.userId };
        next();
    } catch (error) {
        console.error('Token verification error:', error.message);
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// ─── GET Notification Preferences ────────────────────────────────────────────
router.get('/notification-preferences', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const { data, error } = await supabaseAdmin
            .from('user_notification_preferences')
            .select('email_trades, email_security, email_marketing, push_trades, push_messages, push_disputes')
            .eq('user_id', userId)
            .maybeSingle();

        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({ error: 'Failed to fetch preferences: ' + error.message });
        }

        // If no preferences found, return defaults
        if (!data) {
            return res.json({
                email_trades: true,
                email_security: true,
                email_marketing: false,
                push_trades: true,
                push_messages: true,
                push_disputes: true,
            });
        }

        res.json(data);
    } catch (error) {
        console.error('Error fetching notification preferences:', error);
        res.status(500).json({ error: 'Failed to fetch preferences: ' + error.message });
    }
});

// ─── UPDATE Notification Preferences ─────────────────────────────────────────
router.put('/notification-preferences', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const {
            email_trades,
            email_security,
            email_marketing,
            push_trades,
            push_messages,
            push_disputes,
        } = req.body;

        // Prepare data for upsert
        const preferences = {
            user_id: userId,
            email_trades: email_trades ?? true,
            email_security: email_security ?? true,
            email_marketing: email_marketing ?? false,
            push_trades: push_trades ?? true,
            push_messages: push_messages ?? true,
            push_disputes: push_disputes ?? true,
            updated_at: new Date().toISOString(),
        };

        // Upsert: Insert or update
        const { data, error } = await supabaseAdmin
            .from('user_notification_preferences')
            .upsert(preferences, {
                onConflict: 'user_id',
                ignoreDuplicates: false
            })
            .select()
            .maybeSingle();

        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({ error: 'Failed to save preferences: ' + error.message });
        }

        res.json({
            success: true,
            data: data,
            message: 'Preferences saved successfully'
        });
    } catch (error) {
        console.error('Error saving notification preferences:', error);
        res.status(500).json({ error: 'Failed to save preferences: ' + error.message });
    }
});

module.exports = router;