#!/bin/zsh
# 제미나이에서 내려받은 그림을 받은 순서대로 art/raw/<이름>.png 로 옮긴다
# 사용: tools/grab.sh 이름1 [이름2 ...]
M=/private/tmp/claude-501/gemini.marker
for name in "$@"; do
  f=""
  for i in {1..25}; do
    f=$(ls -tr ~/Downloads/Gemini_Generated_Image_*.png 2>/dev/null | while read x; do [ "$x" -nt $M ] && { echo "$x"; break; }; done)
    [ -n "$f" ] && break; sleep 1
  done
  [ -z "$f" ] && { echo "새 그림 없음: $name"; exit 1; }
  dest=~/projects/roundtable/art/raw/$name.png
  mkdir -p ${dest:h}; touch -r "$f" $M; mv "$f" "$dest"; echo "$name $(sips -g pixelWidth -g pixelHeight $dest | tail -2 | awk '{print $2}' | xargs)"
done
