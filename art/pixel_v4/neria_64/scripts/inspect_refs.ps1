# Reference crops stay in memory; no reference-sheet crops are saved.
Add-Type -AssemblyName System.Drawing
function Get-CropData($path, $x, $y, $w, $h, $scale) {
  $src = [System.Drawing.Bitmap]::FromFile((Join-Path $PWD $path))
  $bmp = [System.Drawing.Bitmap]::new(($w*$scale), ($h*$scale))
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $dst = [System.Drawing.Rectangle]::new(0,0,$bmp.Width,$bmp.Height)
  $g.DrawImage($src, $dst, $x,$y,$w,$h, [System.Drawing.GraphicsUnit]::Pixel)
  $mem = [System.IO.MemoryStream]::new()
  $bmp.Save($mem,[System.Drawing.Imaging.ImageFormat]::Jpeg)
  $result = 'data:image/jpeg;base64,' + [Convert]::ToBase64String($mem.ToArray())
  $g.Dispose(); $src.Dispose(); $bmp.Dispose(); $mem.Dispose()
  return $result
}
$src = [System.Drawing.Bitmap]::FromFile((Join-Path $PWD 'source.png'))
$points = @{
  hair_light=@(501,40); hair_mid=@(587,86); hair_shadow=@(421,231)
  hair_aqua=@(232,769); hair_aqua_shadow=@(748,851)
  skin_light=@(510,151); skin_shadow=@(472,150); skin_blush=@(501,177)
  navy_dark=@(452,518); navy_mid=@(568,660); blue_pattern=@(623,366)
  blue_light=@(351,452); cloth_light=@(412,361); cloth_shadow=@(391,408)
  glove=@(607,539); gold=@(543,549); coral=@(463,427); eye=@(562,144)
}
$samples = @{}
foreach ($key in $points.Keys) {
  $xy = $points[$key]
  $c = $src.GetPixel($xy[0],$xy[1])
  $samples[$key] = @{xy=$xy; rgb=@($c.R,$c.G,$c.B)}
}
$size = @($src.Width,$src.Height)
$src.Dispose()
@{pose=(Get-CropData 'reference_pose.png' 0 0 97 102 5); source=(Get-CropData 'source.png' 337 10 338 615 1); source_size=$size; samples=$samples} | ConvertTo-Json -Depth 5 -Compress
