# คืนค่าพิกัดมุมซ้ายบน "X,Y" ของจอที่เลือก (จอ 1 = จอหลักเสมอ จากนั้นไล่ซ้าย->ขวา)
# ใช้โดย start-display.cmd
param([int]$Mon = 1)
Add-Type -AssemblyName System.Windows.Forms
$s = @([System.Windows.Forms.Screen]::AllScreens |
  Sort-Object @{ e = { if ($_.Primary) { 0 } else { 1 } } }, @{ e = { $_.Bounds.X } })
$i = $Mon - 1
if ($i -lt 0 -or $i -ge $s.Length) { $i = 0 }
'{0},{1}' -f $s[$i].Bounds.X, $s[$i].Bounds.Y
