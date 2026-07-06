using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public class IconAlphaProcessor {
  public static void Process(string input, string output) {
    using (var src = new Bitmap(input)) {
      using (var cut = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb)) {
        for (int y=0; y<src.Height; y++) {
          for (int x=0; x<src.Width; x++) {
            var c = src.GetPixel(x,y);
            int maxRB = Math.Max(c.R, c.B);
            bool greenBg = c.G > 95 && c.G > maxRB + 35 && c.R < 150 && c.B < 150;
            if (greenBg) {
              cut.SetPixel(x,y, Color.FromArgb(0, 0, 0, 0));
            } else {
              // light despill on edge pixels: reduce excess green without changing subject style too much
              int g = c.G;
              if (g > maxRB + 12) g = Math.Min(g, maxRB + 12);
              cut.SetPixel(x,y, Color.FromArgb(255, c.R, g, c.B));
            }
          }
        }
        using (var dst = new Bitmap(512,512,PixelFormat.Format32bppArgb)) {
          using (var g = Graphics.FromImage(dst)) {
            g.Clear(Color.Transparent);
            g.CompositingMode = CompositingMode.SourceCopy;
            g.CompositingQuality = CompositingQuality.HighQuality;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.SmoothingMode = SmoothingMode.None;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.DrawImage(cut, new Rectangle(0,0,512,512), new Rectangle(0,0,src.Width,src.Height), GraphicsUnit.Pixel);
          }
          Directory.CreateDirectory(Path.GetDirectoryName(output));
          dst.Save(output, ImageFormat.Png);
        }
      }
    }
  }
}
