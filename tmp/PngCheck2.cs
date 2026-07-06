using System;
using System.Drawing;
public class PngCheck2 {
 public static void Check(string path) {
  using (var img = new Bitmap(path)) {
   int transparent=0, opaque=0, semi=0, greenOpaque=0;
   int[,] corners = new int[,]{{0,0},{511,0},{0,511},{511,511}};
   Console.WriteLine(String.Format("size={0}x{1} pixelFormat={2}", img.Width, img.Height, img.PixelFormat));
   for(int y=0;y<img.Height;y++) for(int x=0;x<img.Width;x++) { var c=img.GetPixel(x,y); if(c.A==0) transparent++; else if(c.A==255) opaque++; else semi++; if(c.A>0 && c.G>180 && c.R<80 && c.B<80) greenOpaque++; }
   Console.WriteLine(String.Format("transparent={0} opaque={1} semi={2} greenOpaque={3}", transparent, opaque, semi, greenOpaque));
   for(int i=0;i<4;i++){ var c=img.GetPixel(corners[i,0], corners[i,1]); Console.WriteLine(String.Format("corner{0}=rgba({1},{2},{3},{4})", i, c.R, c.G, c.B, c.A)); }
  }
 }
}
