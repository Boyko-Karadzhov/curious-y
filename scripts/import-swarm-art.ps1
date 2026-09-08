param([string]$Root = "$PSScriptRoot/..")
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$refs=@([System.Drawing.Bitmap].Assembly.Location,[System.Drawing.Rectangle].Assembly.Location,'System.Runtime')
$refs += [System.Drawing.Bitmap].Assembly.GetReferencedAssemblies() | ForEach-Object { [System.Reflection.Assembly]::Load($_).Location }
Add-Type -ReferencedAssemblies ($refs | Select-Object -Unique) -TypeDefinition @'
using System;
using System.IO;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
public static class SwarmImport {
 public static Bitmap Matte(string path) {
  using(var input=new Bitmap(path)) {
   var output=new Bitmap(input.Width,input.Height,PixelFormat.Format32bppArgb);
   bool alpha=input.GetPixel(0,0).A==0;
   for(int y=0;y<input.Height;y++)for(int x=0;x<input.Width;x++) {
    var c=input.GetPixel(x,y);double a=1,peak=Math.Max(c.R,c.B);
    // Preserve native generated alpha; otherwise remove the authored export matte.
    // The narrow magenta key leaves blue/violet enamel and pale metal intact.
    if(!alpha&&peak>20&&Math.Min(c.R,c.B)>peak*.75)a=Math.Clamp((c.G/peak-.08)/.20,0,1);
    if(a*c.A<8)continue;
    int r=c.R,g=c.G,b=c.B;
    if(!alpha&&a<1){r=(int)Math.Clamp((r-255*(1-a))/a,0,255);g=(int)Math.Clamp(g/a,0,255);b=(int)Math.Clamp((b-255*(1-a))/a,0,255);}
    output.SetPixel(x,y,Color.FromArgb((int)(a*c.A),r,g,b));
   }
   return output;
  }
 }
 static void Clean(Bitmap image,Rectangle cell) {
  int w=cell.Width,h=cell.Height;var labels=new int[w*h];var queue=new int[w*h];int label=0,biggest=0,biggestSize=0;
  for(int y=0;y<h;y++)for(int x=0;x<w;x++) {
   int start=y*w+x;if(labels[start]!=0||image.GetPixel(cell.X+x,cell.Y+y).A<20)continue;
   label++;int head=0,tail=1;queue[0]=start;labels[start]=label;
   while(head<tail){int p=queue[head++],px=p%w,py=p/w;
    foreach(int n in new int[]{px>0?p-1:-1,px<w-1?p+1:-1,py>0?p-w:-1,py<h-1?p+w:-1})
     if(n>=0&&labels[n]==0&&image.GetPixel(cell.X+n%w,cell.Y+n/w).A>=20){labels[n]=label;queue[tail++]=n;}
   }
   if(tail>biggestSize){biggest=label;biggestSize=tail;}
  }
  for(int y=0;y<h;y++)for(int x=0;x<w;x++)if(labels[y*w+x]!=biggest)image.SetPixel(cell.X+x,cell.Y+y,Color.Transparent);
 }
 static Rectangle Bounds(Bitmap image,Rectangle cell) {
  int l=cell.Right,t=cell.Bottom,r=cell.Left,b=cell.Top;
  for(int y=cell.Top;y<cell.Bottom;y++)for(int x=cell.Left;x<cell.Right;x++)if(image.GetPixel(x,y).A>100){l=Math.Min(l,x);t=Math.Min(t,y);r=Math.Max(r,x);b=Math.Max(b,y);}
  if(r<=l||b<=t)throw new Exception("Empty sprite cell");
  if(l<=cell.Left||r>=cell.Right-1||t<=cell.Top||b>=cell.Bottom-1)throw new Exception("Sprite crosses cell "+cell+" bounds "+l+","+t+","+r+","+b);
  return Rectangle.FromLTRB(l,t,r+1,b+1);
 }
 static void SaveCrop(Bitmap input,Rectangle box,string path,int maxSize) {
  float s=Math.Min(1,(float)maxSize/Math.Max(box.Width,box.Height));
  using(var img=new Bitmap((int)Math.Ceiling(box.Width*s),(int)Math.Ceiling(box.Height*s),PixelFormat.Format32bppArgb))using(var g=Graphics.FromImage(img)) {
   g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.DrawImage(input,new Rectangle(0,0,img.Width,img.Height),box,GraphicsUnit.Pixel);img.Save(path,ImageFormat.Png);
  }
 }
 public static string Unit(string source,string output) {
  Directory.CreateDirectory(output);
  using(var input=Matte(source))using(var atlas=new Bitmap(1024,768,PixelFormat.Format32bppArgb))using(var g=Graphics.FromImage(atlas)) {
   if(input.Width!=1536||input.Height!=1024)throw new Exception("Expected a 1536x1024 source atlas");
   var values=new string[12];
   var cuts=new int[3,5];
   for(int row=0;row<3;row++) {
    int top=(int)Math.Round(row*1024.0/3),bottom=(int)Math.Round((row+1)*1024.0/3);cuts[row,0]=0;cuts[row,4]=1536;
    for(int col=1;col<4;col++) {
     bool found=false;
     for(int d=0;d<=80&&!found;d++)foreach(int sign in new int[]{1,-1}) {
      int cx=col*384+sign*d;bool empty=true;
      for(int yy=top;yy<bottom&&empty;yy++)for(int xx=cx-2;xx<=cx+2;xx++)if(input.GetPixel(xx,yy).A>100){empty=false;break;}
      if(empty){cuts[row,col]=cx;found=true;break;}
     }
     if(!found)throw new Exception("No clean source gutter");
    }
   }
   for(int i=0;i<12;i++) {
    int x=i%4*384,y=(int)Math.Round(i/4*1024.0/3),end=(int)Math.Round((i/4+1)*1024.0/3);
    int left=cuts[i/4,i%4],right=cuts[i/4,i%4+1];
    var cell=new Rectangle(left,y,right-left,end-y);Clean(input,cell);var box=Bounds(input,cell);
    float scale=.58f,dx=16.64f,dy=232-(box.Bottom-y)*scale;
    g.InterpolationMode=InterpolationMode.HighQualityBicubic;
    g.DrawImage(input,new RectangleF(i%4*256+dx+(left-x)*scale,i/4*256+dy,cell.Width*scale,(end-y)*scale),cell,GraphicsUnit.Pixel);
    values[i]="["+dx.ToString(System.Globalization.CultureInfo.InvariantCulture)+","+dy.ToString(System.Globalization.CultureInfo.InvariantCulture)+","+y+"]";
   }
   atlas.Save(output+"/atlas.png",ImageFormat.Png);
   SaveCrop(atlas,Bounds(atlas,new Rectangle(0,0,256,256)),output+"/portrait.png",256);
   var idle=Bounds(atlas,new Rectangle(0,0,256,256));
   return "{\"idleHeight\":"+idle.Height+",\"transforms\":["+String.Join(",",values)+"]}";
  }
 }
 public static void Gear(string source,string output,int tier) {
  Directory.CreateDirectory(output);
  using(var input=Matte(source)) {
   var parts=new string[]{"armor","upper","lower","artifact"};
   for(int i=0;i<4;i++) {
    int x=i%2*input.Width/2,y=i/2*input.Height/2;
    var cell=new Rectangle(x,y,input.Width/2,input.Height/2);Clean(input,cell);
    SaveCrop(input,Bounds(input,cell),output+"/"+parts[i]+"-"+tier+".png",384);
   }
  }
  // The catalog uses both authored jaw pieces, just as the unit renderer does.
  using(var upper=new Bitmap(output+"/upper-"+tier+".png"))using(var lower=new Bitmap(output+"/lower-"+tier+".png"))
  using(var icon=new Bitmap(256,256,PixelFormat.Format32bppArgb))using(var g=Graphics.FromImage(icon)) {
   g.InterpolationMode=InterpolationMode.HighQualityBicubic;
   g.DrawImage(lower,new RectangleF(20,113,216,113));g.DrawImage(upper,new RectangleF(20,30,216,113));
   icon.Save(output+"/weapon-"+tier+".png",ImageFormat.Png);
  }
 }
}
'@
$Root=[System.IO.Path]::GetFullPath($Root)
$metadata=[ordered]@{}
foreach($id in @('hatchling','forager','stinger','ravager','hive-guard')) {
 $metadata[$id]=([SwarmImport]::Unit("$Root/docs/art/swarm-v2/$id-source.png","$Root/public/assets/units/$id-v2") | ConvertFrom-Json)
}
foreach($tier in 1..5){[SwarmImport]::Gear("$Root/docs/art/swarm-v2/gear-$tier-source.png","$Root/public/assets/equipment/swarm-v1",$tier)}
$metadata | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 "$Root/docs/art/swarm-v2/import-metadata.json"
Copy-Item -LiteralPath "$Root/docs/art/swarm-v2/import-metadata.json" -Destination "$Root/src/lib/kingdom/swarmRig.json"
Write-Output 'Imported 60 animation frames, 5 portraits and 15 equipment designs with separate jaw components.'
