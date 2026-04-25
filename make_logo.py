"""Generate WidColor logo 400x272"""
from PIL import Image, ImageDraw, ImageFont
import os

img = Image.new('RGBA', (400, 272), (30, 41, 59, 255))
draw = ImageDraw.Draw(img)

# Color circles for pipelines
colors = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444']
from PIL import ImageColor
for i, color in enumerate(colors):
    x = 60 + i * 60
    rgb = ImageColor.getrgb(color)
    draw.ellipse([x, 60, x+44, 104], fill=rgb)

# Text
try:
    font_large = ImageFont.truetype('arial.ttf', 42)
    font_small = ImageFont.truetype('arial.ttf', 18)
except:
    try:
        font_large = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 42)
        font_small = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 18)
    except:
        font_large = ImageFont.load_default()
        font_small = ImageFont.load_default()

draw.text((60, 130), 'WidColor', fill=(255,255,255,255), font=font_large)
draw.text((60, 190), 'Cor por Funil', fill=(156,163,175,255), font=font_small)
draw.text((60, 220), 'kommo widget', fill=(107,114,128,255), font=font_small)

img.save('images/logo.png', 'PNG')
print('Logo saved:', os.path.getsize('images/logo.png'), 'bytes')
print('Size:', img.size)