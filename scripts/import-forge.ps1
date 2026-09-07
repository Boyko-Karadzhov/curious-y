param([string]$CatalogSource, [string]$BodySource, [string]$BodyName)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$drawingRefs=@([System.Drawing.Bitmap].Assembly.Location,[System.Drawing.Rectangle].Assembly.Location,'System.Runtime')
$drawingRefs += [System.Drawing.Bitmap].Assembly.GetReferencedAssemblies() | ForEach-Object { [System.Reflection.Assembly]::Load($_).Location }
Add-Type -ReferencedAssemblies ($drawingRefs | Select-Object -Unique) -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
public static class ForgeImport {
 public static Bitmap Matte(string source) {
  using(var input=new Bitmap(source)) {
   var result=new Bitmap(input.Width,input.Height,PixelFormat.Format32bppArgb);
   for(int y=0;y<input.Height;y++)for(int x=0;x<input.Width;x++){
    var c=input.GetPixel(x,y);double peak=Math.Max(c.R,c.B);
    // Key only saturated magenta; preserve the authored purple runes.
    double keyed=peak>20 && Math.Min(c.R,c.B)>peak*.75 ? Math.Clamp((c.G/peak-.08)/.20,0,1) : 1;
    double alpha=keyed*c.A/255;
    if(alpha<.04)continue;
    result.SetPixel(x,y,Color.FromArgb((int)(alpha*255),c.R,c.G,c.B));
   }
   return result;
  }
 }
 public static void Body(string source,string output){using(var body=Matte(source))body.Save(output,ImageFormat.Png);}
 public static void Catalog(string source,string output){
  int[] rows={0,148,272,376,479,596,692,793,897,978,1071,1172,1265,1357,1453,1536};
  string[] classes={"melee","ranged","mounted","healer","siege"},slots={"weapon","armor","artifact"};
  using(var input=Matte(source))using(var atlas=new Bitmap(640,1920,PixelFormat.Format32bppArgb))using(var g=Graphics.FromImage(atlas)){
   g.InterpolationMode=InterpolationMode.HighQualityBicubic;
   for(int row=0;row<15;row++)for(int col=0;col<5;col++){
    int x0=col*200,y0=rows[row],w=200,h=rows[row+1]-y0;
    // Keep the main connected icon; discard detached row-edge fragments.
    var seen=new bool[w*h];var keep=new bool[w*h];int best=0;
    for(int py=0;py<h;py++)for(int px=0;px<w;px++){
     int start=py*w+px;if(seen[start]||input.GetPixel(x0+px,y0+py).A<100)continue;
     var queue=new int[w*h];int head=0,tail=0;queue[tail++]=start;seen[start]=true;
     while(head<tail){int p=queue[head++],xx=p%w,yy=p/w;for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++){int nx=xx+dx,ny=yy+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;int np=ny*w+nx;if(!seen[np]&&input.GetPixel(x0+nx,y0+ny).A>=100){seen[np]=true;queue[tail++]=np;}}}
     if(tail>best){Array.Clear(keep,0,keep.Length);for(int q=0;q<tail;q++)keep[queue[q]]=true;best=tail;}
    }
    // Preserve antialias pixels touching the selected silhouette.
    for(int py=0;py<h;py++)for(int px=0;px<w;px++){bool near=false;for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++){int nx=px+dx,ny=py+dy;if(nx>=0&&ny>=0&&nx<w&&ny<h&&keep[ny*w+nx])near=true;}if(!near)input.SetPixel(x0+px,y0+py,Color.Transparent);}
    int left=x0+w,top=y0+h,right=x0,bottom=y0;
    for(int y=y0;y<y0+h;y++)for(int x=x0;x<x0+w;x++)if(input.GetPixel(x,y).A>=180){left=Math.Min(left,x);top=Math.Min(top,y);right=Math.Max(right,x);bottom=Math.Max(bottom,y);}
    if(right<=left||bottom<=top)throw new Exception("Empty equipment cell");
    var rect=new Rectangle(left,top,right-left+1,bottom-top+1);
    double scale=110.0/Math.Max(rect.Width,rect.Height);int dw=(int)(rect.Width*scale),dh=(int)(rect.Height*scale);
    g.DrawImage(input,new Rectangle(col*128+(128-dw)/2,row*128+(128-dh)/2,dw,dh),rect,GraphicsUnit.Pixel);
    using(var icon=new Bitmap(rect.Width,rect.Height,PixelFormat.Format32bppArgb))using(var ig=Graphics.FromImage(icon)){
     ig.DrawImage(input,new Rectangle(0,0,rect.Width,rect.Height),rect,GraphicsUnit.Pixel);
     icon.Save(output+"/"+classes[row/3]+"-"+slots[row%3]+"-"+(col+1)+".png",ImageFormat.Png);
    }
   }
   atlas.Save(output+"/catalog.png",ImageFormat.Png);
  }
 }
}
'@
$forgeOutput=[System.IO.Path]::GetFullPath("$PSScriptRoot/../public/assets/equipment/forge-v1")
New-Item -ItemType Directory -Force -Path $forgeOutput | Out-Null
if($CatalogSource){[ForgeImport]::Catalog($CatalogSource,$forgeOutput)}
if($BodySource){if($BodyName -notmatch '^[a-z0-9-]+$'){throw 'Invalid body name'};[ForgeImport]::Body($BodySource,"$forgeOutput/$BodyName.png")}
