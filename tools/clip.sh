#!/bin/zsh
# 클립보드의 그림을 art/raw/<이름>.png 로 저장 (제미나이 '이미지 복사' 뒤에)
F=~/projects/roundtable/art/raw/$1.png; mkdir -p ${F:h}
for i in {1..10}; do osascript -e 'clipboard info' | grep -q PNGf && break; sleep 1; done
osascript -e "set f to open for access POSIX file \"$F\" with write permission" -e 'set eof f to 0' -e 'write (the clipboard as «class PNGf») to f' -e 'close access f' >/dev/null
md5 -q $F > /tmp/clip.$$; if [ -f /private/tmp/claude-501/clip.last ] && cmp -s /tmp/clip.$$ /private/tmp/claude-501/clip.last; then echo "같은 그림(복사 안 됨): $1"; rm /tmp/clip.$$; exit 1; fi
mv /tmp/clip.$$ /private/tmp/claude-501/clip.last; osascript -e 'set the clipboard to ""'
echo "$1 $(sips -g pixelWidth -g pixelHeight $F | tail -2 | awk '{print $2}' | xargs)"
