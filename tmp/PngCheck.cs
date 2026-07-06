using System;
using System.Drawing;
public class PngCheck {
 public static void Check(string path) {
  using (var img = new Bitmap(path)) {
   int transparent=0, opaque=0, semi=0, greenOpaque=0;
   int[,] corners = new int[,]{{0,0},{511,0},{0,511},{511,511}};
   Console.WriteLine($"size={img.Width}x{img.Height} pixelFormat={img.PixelFormat}");
   for(int y=0;y<img.Height;y++) for(int x=0;x<img.Width;x++) { var c=img.GetPixel(x,y); if(c.A==0) transparent++; else if(c.A==255) opaque++; else semi++; if(c.A>0 && c.G>180 && c.R<80 && c.B<80) greenOpaque++; }
   Console.WriteLine($"transparent={transparent} opaque={opaque} semi={semi} greenOpaque={greenOpaque}");
   for(int i=0;i<4;i++){ var c=img.GetPixel(corners[i,0], corners[i,1]); Console.WriteLine($"corner{i}=rgba({c.R},{c.G},{c.B},{c.A})"); }
  }
 }
}
