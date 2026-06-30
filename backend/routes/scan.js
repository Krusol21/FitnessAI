const express = require('express');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const { authenticate } = require('./middleware');

const router = express.Router();
router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  },
});

const client = new Anthropic();

router.post('/', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image file required' });

    const base64 = req.file.buffer.toString('base64');
    const mediaType = req.file.mimetype;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            {
              type: 'text',
              text: `Extract nutrition information from this image (food label, nutrition facts panel, or food item). Return ONLY a JSON object with these exact fields:
{
  "name": "food name",
  "calories": number (per serving),
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "serving_size": number,
  "serving_unit": "string (e.g. g, oz, cup, piece)"
}
If the image is not a food item or nutrition label, return { "error": "Not a food item" }.
Do not include any text outside the JSON object.`,
            },
          ],
        },
      ],
    });

    const text = response.content[0].text.trim();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return res.status(422).json({ error: 'Could not parse nutrition from image' });
    }

    if (parsed.error) return res.status(422).json({ error: parsed.error });

    res.json(parsed);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
