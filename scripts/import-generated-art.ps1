param([string]$Manifest = "$PSScriptRoot/../docs/art/generated-manifest.json")
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$drawingRefs = @([System.Drawing.Bitmap].Assembly.Location, [System.Drawing.Rectangle].Assembly.Location, 'System.Runtime')
$drawingRefs += [System.Drawing.Bitmap].Assembly.GetReferencedAssemblies() | ForEach-Object { [System.Reflection.Assembly]::Load($_).Location }
Add-Type -ReferencedAssemblies ($drawingRefs | Select-Object -Unique) -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
public static class GeneratedArtImport {
  static Bitmap Key(Bitmap input) {
    var output=new Bitmap(input.Width,input.Height,PixelFormat.Format32bppArgb);
    for(int y=0;y<input.Height;y++) for(int x=0;x<input.Width;x++) {
      var c=input.GetPixel(x,y);
      // Magenta is reserved for the export matte, never used in the art palette.
      double spill=Math.Max(0,Math.Min(c.R,c.B)-c.G);
      double a=1-Math.Min(1,spill/180);
      if(a<.04 || c.A==0) continue;
      int r=(int)Math.Max(0,Math.Min(255,(c.R-255*(1-a))/a));
      int b=(int)Math.Max(0,Math.Min(255,(c.B-255*(1-a))/a));
      int g=(int)Math.Min(255,c.G/a);
      if(spill>25) g=Math.Min(g,Math.Max(r,b)); // suppress green edge spill
      output.SetPixel(x,y,Color.FromArgb((int)(a*c.A),r,g,b));
    }
    return output;
  }
  static Rectangle Bounds(Bitmap image,Rectangle cell) {
    int left=cell.Right,top=cell.Bottom,right=cell.X,bottom=cell.Y,count=0;
    for(int y=cell.Y;y<cell.Bottom;y++) for(int x=cell.X;x<cell.Right;x++) if(image.GetPixel(x,y).A>100) {
      left=Math.Min(left,x);right=Math.Max(right,x);top=Math.Min(top,y);bottom=Math.Max(bottom,y);count++;
    }
    if(count<300) throw new Exception("Empty asset/frame");
    return Rectangle.FromLTRB(left,top,right+1,bottom+1);
  }
  static void CheckMargin(Bitmap cell) {
    for(int x=0;x<cell.Width;x++) if(cell.GetPixel(x,0).A>100||cell.GetPixel(x,cell.Height-1).A>100) throw new Exception("Vertical clipping");
    for(int y=0;y<cell.Height;y++) if(cell.GetPixel(0,y).A>100||cell.GetPixel(cell.Width-1,y).A>100) throw new Exception("Horizontal clipping");
  }
  static void KeepLargestComponent(Bitmap image) {
    int width=image.Width,height=image.Height;var labels=new int[width*height];var queue=new int[labels.Length];
    int label=0,biggest=0,biggestSize=0;
    for(int y=0;y<height;y++) for(int x=0;x<width;x++) {
      int start=y*width+x;if(labels[start]!=0||image.GetPixel(x,y).A<20)continue;
      label++;int head=0,tail=1;queue[0]=start;labels[start]=label;
      while(head<tail){int p=queue[head++],px=p%width,py=p/width;
        foreach(int n in new int[]{px>0?p-1:-1,px<width-1?p+1:-1,py>0?p-width:-1,py<height-1?p+width:-1})
          if(n>=0&&labels[n]==0&&image.GetPixel(n%width,n/width).A>=20){labels[n]=label;queue[tail++]=n;}
      }
      if(tail>biggestSize){biggest=label;biggestSize=tail;}
    }
    for(int y=0;y<height;y++)for(int x=0;x<width;x++)if(labels[y*width+x]!=biggest)image.SetPixel(x,y,Color.Transparent);
  }
  public static void Run(string source,string destination,bool building,int cropIndex) {
    // Reviewed gutters for the Keep upgrade sheet: lower spires extend above
    // the nominal 512px row boundary into otherwise empty space.
    Rectangle[] keepCrops={new Rectangle(0,0,512,490),new Rectangle(512,0,512,520),new Rectangle(1024,0,512,490),
      new Rectangle(0,490,512,534),new Rectangle(512,490,484,534),new Rectangle(996,490,540,534)};
    using(var raw=new Bitmap(source))
    using(var input=cropIndex<0?new Bitmap(raw):raw.Clone(keepCrops[cropIndex],PixelFormat.Format32bppArgb))
    using(var keyed=Key(input)) {
      if(cropIndex>=0) KeepLargestComponent(keyed);
      if(building) {
        var box=Bounds(keyed,new Rectangle(0,0,keyed.Width,keyed.Height));
        if(box.Left==0||box.Top==0||box.Right==keyed.Width||box.Bottom==keyed.Height) throw new Exception("Building touches source edge: "+box+" in "+keyed.Width+"x"+keyed.Height);
        using(var result=new Bitmap(512,512,PixelFormat.Format32bppArgb)) {
          float scale=Math.Min(464f/box.Width,464f/box.Height);
          using(var g=Graphics.FromImage(result)) {g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.DrawImage(keyed,new RectangleF((512-box.Width*scale)/2,488-box.Height*scale,box.Width*scale,box.Height*scale),box,GraphicsUnit.Pixel);}
          CheckMargin(result);result.Save(destination+"/image.png",ImageFormat.Png);
        }
        return;
      }
      if(input.Width!=1536||input.Height!=1024) throw new Exception("Expected 1536x1024 unit atlas");
      var boxes=new Rectangle[12];var cells=new Rectangle[12];var pivots=new float[12];float scaleAll=1;
      var rowCuts=new int[]{0,341,683,1024};
      for(int row=1;row<3;row++) {
        bool found=false;
        for(int distance=0;distance<=75&&!found;distance++) foreach(int sign in new int[]{1,-1}) {
          int y=(int)Math.Round(row*1024.0/3)+sign*distance;bool empty=true;
          for(int x=0;x<1536&&empty;x++) for(int dy=-2;dy<=2;dy++) if(keyed.GetPixel(x,y+dy).A>100){empty=false;break;}
          if(empty){rowCuts[row]=y;found=true;break;}
        }
        if(!found) throw new Exception("No clean horizontal gutter at row "+row);
      }
      // Find a genuinely empty gutter near each requested column boundary.
      // Models sometimes extend a spear past the nominal grid into unused space.
      // Moving the crop boundary is lossless; cutting at 384px would clip it.
      var cuts=new int[3,5];
      for(int row=0;row<3;row++) {
        int top=rowCuts[row],bottom=rowCuts[row+1];
        cuts[row,0]=0;cuts[row,4]=1536;
        for(int col=1;col<4;col++) {
          bool found=false;
          for(int distance=0;distance<=100&&!found;distance++) foreach(int sign in new int[]{1,-1}) {
            int x=col*384+sign*distance;bool empty=true;
            for(int y=top;y<bottom&&empty;y++) for(int dx=-2;dx<=2;dx++) if(keyed.GetPixel(x+dx,y).A>100){empty=false;break;}
            if(empty){cuts[row,col]=x;found=true;break;}
          }
          if(!found) throw new Exception("No clean gutter in row "+row+" column "+col);
        }
      }
      for(int i=0;i<12;i++) {
        int row=i/4,col=i%4,y=rowCuts[row],end=rowCuts[row+1];
        cells[i]=new Rectangle(cuts[row,col],y,cuts[row,col+1]-cuts[row,col],end-y);boxes[i]=Bounds(keyed,cells[i]);
        var box=boxes[i];
        if(box.Left<=cells[i].Left||box.Right>=cells[i].Right||box.Top<=cells[i].Top||box.Bottom>=cells[i].Bottom) throw new Exception("Source frame crosses grid boundary: "+i);
        // Feet/lower chassis anchor ignores raised weapons, cloaks and effects.
        long sum=0,count=0;int low=box.Bottom-Math.Max(8,box.Height/5);
        for(int yy=low;yy<box.Bottom;yy++) for(int xx=box.Left;xx<box.Right;xx++) if(keyed.GetPixel(xx,yy).A>128){sum+=xx;count++;}
        pivots[i]=count>0?(float)sum/count:box.Left+box.Width/2f;
        scaleAll=Math.Min(scaleAll,212f/box.Height);
        scaleAll=Math.Min(scaleAll,116f/Math.Max(pivots[i]-box.Left,box.Right-pivots[i]));
      }
      using(var atlas=new Bitmap(1024,768,PixelFormat.Format32bppArgb)) using(var g=Graphics.FromImage(atlas)) {
        for(int i=0;i<12;i++) using(var cell=new Bitmap(256,256,PixelFormat.Format32bppArgb)) {
          var box=boxes[i];
          using(var cg=Graphics.FromImage(cell)) {
            cg.InterpolationMode=InterpolationMode.HighQualityBicubic;
            cg.DrawImage(keyed,new RectangleF(128+(box.Left-pivots[i])*scaleAll,232-box.Height*scaleAll,box.Width*scaleAll,box.Height*scaleAll),box,GraphicsUnit.Pixel);
          }
          CheckMargin(cell);g.DrawImageUnscaled(cell,i%4*256,i/4*256);
          if(i==0) {
            var portraitBox=Bounds(cell,new Rectangle(0,0,256,256));
            portraitBox.Inflate(6,6);portraitBox.Intersect(new Rectangle(0,0,256,256));
            using(var portrait=cell.Clone(portraitBox,PixelFormat.Format32bppArgb)) portrait.Save(destination+"/portrait.png",ImageFormat.Png);
          }
        }
        atlas.Save(destination+"/atlas.png",ImageFormat.Png);
      }
    }
  }
}
'@
$repo = [System.IO.Path]::GetFullPath("$PSScriptRoot/..")
$entries = Get-Content -Raw -LiteralPath $Manifest | ConvertFrom-Json
foreach ($entry in $entries) {
  $group = if ($entry.kind -eq 'building') { 'buildings' } else { 'units' }
  $destination = Join-Path $repo "public/assets/$group/$($entry.id)-v1"
  New-Item -ItemType Directory -Force -Path $destination | Out-Null
  $cropIndex = if ($null -ne $entry.cropIndex) { [int]$entry.cropIndex } else { -1 }
  [GeneratedArtImport]::Run((Join-Path $repo $entry.source), $destination, ($entry.kind -eq 'building'), $cropIndex)
  Write-Output "Imported $($entry.id): alpha, nonempty frames and margins verified"
}
