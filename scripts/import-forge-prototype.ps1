param()
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$drawingRefs = @([System.Drawing.Bitmap].Assembly.Location, [System.Drawing.Rectangle].Assembly.Location, 'System.Runtime')
$drawingRefs += [System.Drawing.Bitmap].Assembly.GetReferencedAssemblies() | ForEach-Object { [System.Reflection.Assembly]::Load($_).Location }
Add-Type -ReferencedAssemblies ($drawingRefs | Select-Object -Unique) -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
public static class ForgePrototypeImport {
  public static void Base(string source, string output) {
    using(var input = new Bitmap(source))
    using(var result = new Bitmap(input.Width,input.Height,PixelFormat.Format32bppArgb)) {
      if(input.Width!=1536 || input.Height!=1024) throw new Exception("Unexpected base sheet geometry");
      for(int y=0;y<input.Height;y++) for(int x=0;x<input.Width;x++) {
        var c=input.GetPixel(x,y);
        double spill=Math.Max(0,Math.Min(c.R,c.B)-c.G);
        double alpha=1-Math.Min(1,spill/175);
        if(alpha<.04) continue;
        int r=(int)Math.Clamp((c.R-240*(1-alpha))/alpha,0,255);
        int g=(int)Math.Clamp(c.G/alpha,0,255);
        int b=(int)Math.Clamp((c.B-240*(1-alpha))/alpha,0,255);
        result.SetPixel(x,y,Color.FromArgb((int)(alpha*255),r,g,b));
      }
      result.Save(output,ImageFormat.Png);
    }
  }
  public static void Item(string source,string output) {
    using(var input=new Bitmap(source)) {
      int left=input.Width,top=input.Height,right=0,bottom=0,clear=0;
      for(int y=0;y<input.Height;y++) for(int x=0;x<input.Width;x++) {
        var c=input.GetPixel(x,y);
        if(c.A==0)clear++;
        if(c.A<220)continue;
        left=Math.Min(left,x);top=Math.Min(top,y);right=Math.Max(right,x);bottom=Math.Max(bottom,y);
      }
      if(clear<100 || right<=left)throw new Exception("Expected transparent item: "+source);
      left=Math.Max(0,left-8);top=Math.Max(0,top-8);right=Math.Min(input.Width-1,right+8);bottom=Math.Min(input.Height-1,bottom+8);
      double scale=384.0/Math.Max(right-left+1,bottom-top+1);
      using(var result=new Bitmap((int)Math.Ceiling((right-left+1)*scale),(int)Math.Ceiling((bottom-top+1)*scale),PixelFormat.Format32bppArgb)) {
        using(var g=Graphics.FromImage(result)) {
          g.InterpolationMode=InterpolationMode.HighQualityBicubic;
          g.DrawImage(input,new Rectangle(0,0,result.Width,result.Height),new Rectangle(left,top,right-left+1,bottom-top+1),GraphicsUnit.Pixel);
        }
        result.Save(output,ImageFormat.Png);
      }
    }
  }
}
'@
$forgeSource = [System.IO.Path]::GetFullPath("$PSScriptRoot/../docs/art/forge-prototype")
$forgeOutput = [System.IO.Path]::GetFullPath("$PSScriptRoot/../public/assets/equipment/forge-prototype-v1")
New-Item -ItemType Directory -Force -Path $forgeOutput | Out-Null
[ForgePrototypeImport]::Base("$forgeSource/base-source.png", "$forgeOutput/base.png")
foreach ($forgeItem in @('iron-sword','sunsteel-sword','iron-armor','sunsteel-armor','star-artifact')) {
  [ForgePrototypeImport]::Item("$forgeSource/$forgeItem-source.png", "$forgeOutput/$forgeItem.png")
}
Write-Output "Imported the unarmed base and five transparent equipment sprites."
