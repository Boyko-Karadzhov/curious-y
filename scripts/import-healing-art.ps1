param([Parameter(Mandatory=$true)][string]$Source)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$drawingRefs = @([System.Drawing.Bitmap].Assembly.Location, [System.Drawing.Rectangle].Assembly.Location, 'System.Runtime')
$drawingRefs += [System.Drawing.Bitmap].Assembly.GetReferencedAssemblies() | ForEach-Object { [System.Reflection.Assembly]::Load($_).Location }
Add-Type -ReferencedAssemblies ($drawingRefs | Select-Object -Unique) -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
public static class HealingArtImport {
  public static void Run(string source,string destination) {
    using(var input=new Bitmap(source))
    using(var small=new Bitmap(256,256,PixelFormat.Format32bppArgb))
    using(var output=new Bitmap(256,256,PixelFormat.Format32bppArgb)) {
      using(var g=Graphics.FromImage(small)) {
        g.InterpolationMode=InterpolationMode.HighQualityBicubic;
        g.DrawImage(input,new Rectangle(0,0,256,256));
      }
      int visible=0;
      for(int y=0;y<256;y++)for(int x=0;x<256;x++) {
        var c=small.GetPixel(x,y);
        // Undo a black export matte while retaining the glow's soft opacity.
        int a=Math.Max(c.R,Math.Max(c.G,c.B));
        if(a<=8)continue;
        output.SetPixel(x,y,Color.FromArgb(a,c.R*255/a,c.G*255/a,c.B*255/a));
        visible++;
      }
      if(visible<100||visible>256*256*.8)throw new Exception("Invalid healing effect matte");
      output.Save(destination,ImageFormat.Png);
    }
  }
}
'@
$outputPath = Join-Path ([System.IO.Path]::GetFullPath("$PSScriptRoot/..")) 'public/assets/battle/healing-aura-v1.png'
[HealingArtImport]::Run($Source, $outputPath)
Write-Output "Imported 256px healing aura with soft alpha"
