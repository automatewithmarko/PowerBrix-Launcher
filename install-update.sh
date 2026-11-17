#!/bin/sh
# Runs outside the signed bundle so it can replace the application after exit.
i=0
while kill -0 "$PBX_PID" 2>/dev/null; do
  i=$((i+1))
  if [ "$i" -ge 120 ]; then
    printf '%s\n' 'The launcher did not close. Try the update again.' >"$PBX_REPORT"
    exit 1
  fi
  sleep 1
done
backup="$PBX_STAGE/Previous.app"
if mv "$PBX_DESTINATION" "$backup"; then
  if mv "$PBX_BUNDLE" "$PBX_DESTINATION"; then
    if /usr/bin/open -n "$PBX_DESTINATION" --args "--user-data-dir=$PBX_ROOT"; then
      rm -rf "$PBX_STAGE" "$PBX_FOLDER"
      exit 0
    fi
    mv "$PBX_DESTINATION" "$PBX_BUNDLE"
  fi
  mv "$backup" "$PBX_DESTINATION"
fi
printf '%s\n' 'The update could not be installed. Try again from Applications.' >"$PBX_REPORT"
/usr/bin/open -n "$PBX_DESTINATION" --args "--user-data-dir=$PBX_ROOT"
