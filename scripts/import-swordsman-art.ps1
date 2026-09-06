param([string]$Source = "$PSScriptRoot/../docs/art/swordsman-v1-source.png")
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$drawingRefs = @([System.Drawing.Bitmap].Assembly.Location, [System.Drawing.Rectangle].Assembly.Location, 'System.Runtime')
$drawingRefs += [System.Drawing.Bitmap].Assembly.GetReferencedAssemblies() | ForEach-Object { [System.Reflection.Assembly]::Load($_).Location }
Add-Type -ReferencedAssemblies ($drawingRefs | Select-Object -Unique) -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
public static class SwordsmanImport {
  public static void Run(string source, string output) {
    using (var input = new Bitmap(source))
    using (var keyed = new Bitmap(input.Width, input.Height, PixelFormat.Format32bppArgb))
    using (var atlas = new Bitmap(1024, 768, PixelFormat.Format32bppArgb)) {
      if (input.Width != 1536 || input.Height != 1024) throw new Exception("Expected reviewed 1536 x 1024 source");
      for (int y=0; y<input.Height; y++) for (int x=0; x<input.Width; x++) {
        var c=input.GetPixel(x,y);
        double spill=Math.Max(0, Math.Min(c.R,c.B)-c.G);
        double a=1-Math.Min(1,spill/180);
        if(a<.04) continue;
        int r=(int)Math.Max(0,Math.Min(255,(c.R-255*(1-a))/a));
        int b=(int)Math.Max(0,Math.Min(255,(c.B-255*(1-a))/a));
        int g=(int)Math.Min(255,c.G/a);
        keyed.SetPixel(x,y,Color.FromArgb((int)(a*255),r,g,b));
      }
      // Reviewed body pivots: do not center by weapon bounds (causes sliding).
      int[] pivots={232,594,950,1305,232,594,950,1305,244,597,950,1300};
      using(var graphics=Graphics.FromImage(atlas)) {
        graphics.InterpolationMode=InterpolationMode.HighQualityBicubic;
        graphics.CompositingMode=CompositingMode.SourceCopy;
        for(int i=0;i<12;i++) {
          int col=i%4,row=i/4,x0=col*384,y0=(int)Math.Round(row*1024.0/3),y1=(int)Math.Round((row+1)*1024.0/3);
          int bottom=y0,count=0;
          for(int y=y0;y<y1;y++) for(int x=x0;x<x0+384;x++) if(keyed.GetPixel(x,y).A>128) {bottom=Math.Max(bottom,y);count++;}
          if(count<1000) throw new Exception("Empty frame "+i);
          using(var cell=new Bitmap(256,256,PixelFormat.Format32bppArgb)) {
            using(var cg=Graphics.FromImage(cell)) {
              cg.InterpolationMode=InterpolationMode.HighQualityBicubic;
              cg.DrawImage(keyed,new RectangleF(112+(x0-pivots[i])*.80f,232+(y0-bottom)*.80f,384*.80f,(y1-y0)*.80f),new RectangleF(x0,y0,384,y1-y0),GraphicsUnit.Pixel);
            }
            for(int edge=0;edge<256;edge++) if(cell.GetPixel(0,edge).A>128 || cell.GetPixel(255,edge).A>128 || cell.GetPixel(edge,0).A>128 || cell.GetPixel(edge,255).A>128) throw new Exception("Clipped frame "+i);
            graphics.DrawImageUnscaled(cell,col*256,row*256);
            if(i==0) using(var portrait=cell.Clone(new Rectangle(28,44,192,196),PixelFormat.Format32bppArgb)) portrait.Save(output+"/portrait.png",ImageFormat.Png);
          }
        }
      }
      atlas.Save(output+"/atlas.png",ImageFormat.Png);
    }
  }
}
'@
$destination = [System.IO.Path]::GetFullPath("$PSScriptRoot/../public/assets/units/swordsman-v1")
New-Item -ItemType Directory -Force -Path $destination | Out-Null
[SwordsmanImport]::Run([System.IO.Path]::GetFullPath($Source), $destination)
Write-Output "Imported 12 frames with transparent margins and shared foot baseline to $destination"
