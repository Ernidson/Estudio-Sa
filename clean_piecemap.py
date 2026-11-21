with open('src/parts/PieceMap.js', 'rb') as f:
    content = f.read()

# Replace all non-ASCII characters with their ASCII equivalents or remove them
# Build a translation table
translation = {}
for i in range(128, 256):
    translation[i] = ord('?')

# But we want to preserve the Portuguese characters in comments/strings
# Let's be smarter - only replace non-ASCII in identifiers, keep in strings/comments
# Actually, let's just replace all non-ASCII with ASCII equivalents

replacements = {
    0xc3a7: 'c',  # ç
    0xc3a3: 'a',  # ã
    0xc3a1: 'a',  # á
    0xc3a9: 'e',  # é
    0xc3ad: 'i',  # í
    0xc3b3: 'o',  # ó
    0xc3ba: 'u',  # ú
    0xc3aa: 'e',  # ê
    0xc3b4: 'o',  # ô
    0xc3a2: 'a',  # â
    0xc3aa: 'e',  # ê
    0xc3ad: 'i',  # í
    0xc3b3: 'o',  # ó
    0xc3ba: 'u',  # ú
    0xc3a7: 'c',  # ç
    0xc3b1: 'n',  # ñ
    0xc387: 'C',  # Ç
    0xc383: 'A',  # Ã
    0xc381: 'A',  # Á
    0xc389: 'E',  # É
    0xc38d: 'I',  # Í
    0xc393: 'O',  # Ó
    0xc39a: 'U',  # Ú
    0xc38a: 'E',  # Ê
    0xc394: 'O',  # Ô
    0xc382: 'A',  # Â
    0xc38a: 'E',  # Ê
    0xc38d: 'I',  # Í
    0xc393: 'O',  # Ó
    0xc39a: 'U',  # Ú
    0xc3a7: 'c',  # ç
    0xc3b1: 'n',  # ñ
    0xb5: 'u',    # µ
    0xa3: '?',    # £
    0xa9: 'c',    # ©
    0xae: 'R',    # ®
    0xb0: 'o',    # °
    0xb5: 'u',    # µ
    0xba: 'o',    # º
    0xc2: 'A',    # Â
    0xc3: 'A',    # Ã
    0xb4: ',',    # ´
    0xb8: ',',    # ¸
    0xbc: '1/4',  # ¼
    0xbd: '1/2',  # ½
    0xbe: '3/4',  # ¾
}

# Read the file as UTF-8 text
with open('src/parts/PieceMap.js', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace non-ASCII characters
import re
def replace_non_ascii(match):
    char = match.group(0)
    code = ord(char)
    if code in replacements:
        return replacements[code]
    return '?'

# Replace all non-ASCII characters
cleaned = re.sub(r'[^\x00-\x7F]', replace_non_ascii, text)

with open('src/parts/PieceMap.clean.js', 'w', encoding='utf-8') as f:
    f.write(cleaned)

print('Cleaned file written to src/parts/PieceMap.clean.js')