import javax.imageio.ImageIO; import java.awt.image.BufferedImage; import java.io.File; import java.util.ArrayDeque;
/** iOS 1024 simgesinden Android uyarlanabilir simge katmanları: arka plan (degrade, şekil silinip doldurulur), ön plan (şekil, saydam), tek renk. */
// Kullanım (sunucuda, JDK 17): java -Xmx1g araclar/Ikon.java <iOS ikon-1024.png> <çıkış klasörü> 0.92  → <çıkış>/mipmap-*/ic_launcher_{arka,on,tek}.png
// Kamera: ../kamera-ios/Kamera/Assets.xcassets/AppIcon.appiconset/ikon-1024.png → app/src/main/res; Masa: ../kamera-ios/MasaUygulama/... → masa-uygulama/src/main/res
public class Ikon {
  static final int N = 1024;
  public static void main(String[] a) throws Exception {
    BufferedImage im = ImageIO.read(new File(a[0])); String cikis = a[1]; double olcek = Double.parseDouble(a[2]);
    float[][] P = new float[3][N*N];
    for (int y=0;y<N;y++) for (int x=0;x<N;x++){int p=im.getRGB(x,y); P[0][y*N+x]=(p>>16)&255; P[1][y*N+x]=(p>>8)&255; P[2][y*N+x]=p&255;}
    // Şekil: arka plandan belirgin ayrılan pikseller (degrade en çok 0x40; şekil kenarları dahil olsun diye genişletilir)
    boolean[] sekil = new boolean[N*N];
    for (int i=0;i<N*N;i++){ float mx=Math.max(P[0][i],Math.max(P[1][i],P[2][i])); float mn=Math.min(P[0][i],Math.min(P[1][i],P[2][i])); sekil[i]= mx>0x48 || mx-mn>14; }
    boolean[] genis = genislet(sekil, 4);
    // Arka plan: şekil alanı Laplace (Jacobi) ile çevreden doldurulur, kaba-ince sırayla
    float[][] B = new float[3][];
    for (int c=0;c<3;c++) B[c]=doldur(P[c], genis);
    // Ön plan rengi: çekirdek (kesin şekil) pikselinin rengi en yakın kenar pikseline yayılır; alfa = izdüşüm
    boolean[] cekirdek = new boolean[N*N];
    for (int i=0;i<N*N;i++){ double d=0; for(int c=0;c<3;c++){double e=P[c][i]-B[c][i]; d+=e*e;} cekirdek[i]= sekil[i] && Math.sqrt(d)>70 && !kenar(sekil,i); }
    int[] kaynak = new int[N*N]; java.util.Arrays.fill(kaynak,-1); ArrayDeque<Integer> q=new ArrayDeque<>();
    for (int i=0;i<N*N;i++) if (cekirdek[i]) { kaynak[i]=i; q.add(i); }
    int[] dx={1,-1,0,0}, dy={0,0,1,-1};
    while(!q.isEmpty()){ int i=q.poll(); int x=i%N,y=i/N; for(int k=0;k<4;k++){int nx=x+dx[k],ny=y+dy[k]; if(nx<0||ny<0||nx>=N||ny>=N) continue; int j=ny*N+nx; if(kaynak[j]<0 && genis[j]){kaynak[j]=kaynak[i]; q.add(j);} } }
    BufferedImage on = new BufferedImage(N,N,BufferedImage.TYPE_INT_ARGB), tek = new BufferedImage(N,N,BufferedImage.TYPE_INT_ARGB), arka = new BufferedImage(N,N,BufferedImage.TYPE_INT_RGB);
    for (int i=0;i<N*N;i++){
      int x=i%N,y=i/N;
      arka.setRGB(x,y,rgb(B[0][i],B[1][i],B[2][i]));
      if (kaynak[i]<0) continue;
      int s=kaynak[i]; double pay=0,payda=0;
      for(int c=0;c<3;c++){double f=P[c][s]-B[c][i], p=P[c][i]-B[c][i]; pay+=p*f; payda+=f*f;}
      double al = payda<1?0:Math.max(0,Math.min(1,pay/payda));
      if (al<0.01) continue;
      int A=(int)Math.round(al*255);
      on.setRGB(x,y,(A<<24)|rgb(P[0][s],P[1][s],P[2][s]));
      tek.setRGB(x,y,(A<<24)|0xFFFFFF);
    }
    ImageIO.write(on,"png",new File(cikis+"-on1024.png")); ImageIO.write(arka,"png",new File(cikis+"-arka1024.png"));
    // Katmanlar 108 dp (xxxhdpi 432 px); görünen alan ortadaki 72 dp (288 px). Arka plan görünen alana oturur, dışı kenardan uzatılır.
    // Şekil `olcek` kadar küçültülür (güvenli daire 66 dp içinde kalsın).
    int[] dpiler={48,72,96,144,192}; String[] adlar={"mdpi","hdpi","xhdpi","xxhdpi","xxxhdpi"};
    for (int k=0;k<5;k++){
      int W=dpiler[k]*108/48; double gor=dpiler[k]*72/48.0;
      new File(cikis+"/mipmap-"+adlar[k]).mkdirs();
      ImageIO.write(ornekle(arka,W,gor,1,false),"png",new File(cikis+"/mipmap-"+adlar[k]+"/ic_launcher_arka.png"));
      ImageIO.write(ornekle(on,W,gor,olcek,true),"png",new File(cikis+"/mipmap-"+adlar[k]+"/ic_launcher_on.png"));
      ImageIO.write(ornekle(tek,W,gor,olcek,true),"png",new File(cikis+"/mipmap-"+adlar[k]+"/ic_launcher_tek.png"));
    }
  }
  static boolean kenar(boolean[] m,int i){int x=i%N,y=i/N; for(int yy=y-2;yy<=y+2;yy++)for(int xx=x-2;xx<=x+2;xx++){if(xx<0||yy<0||xx>=N||yy>=N)continue; if(!m[yy*N+xx])return true;} return false;}
  static boolean[] genislet(boolean[] m,int r){boolean[] o=new boolean[N*N]; for(int y=0;y<N;y++)for(int x=0;x<N;x++){if(!m[y*N+x])continue; for(int yy=Math.max(0,y-r);yy<=Math.min(N-1,y+r);yy++)for(int xx=Math.max(0,x-r);xx<=Math.min(N-1,x+r);xx++)o[yy*N+xx]=true;} return o;}
  static int rgb(double r,double g,double b){return (cl(r)<<16)|(cl(g)<<8)|cl(b);}
  static int cl(double v){return (int)Math.max(0,Math.min(255,Math.round(v)));}
  /** Maskeli alanı çevreden düzgünce doldurur: 1/16 ölçekte çözer, büyütüp her ölçekte Jacobi ile inceltir */
  static float[] doldur(float[] v, boolean[] m){
    float[] u=null; int prev=0;
    for (int n=64;n<=N;n*=2){
      int f=N/n; float[] vv=new float[n*n]; boolean[] mm=new boolean[n*n];
      for(int y=0;y<n;y++)for(int x=0;x<n;x++){double s=0;int c=0;boolean any=false; for(int yy=0;yy<f;yy++)for(int xx=0;xx<f;xx++){int i=(y*f+yy)*N+x*f+xx; if(m[i])any=true; else {s+=v[i];c++;}} mm[y*n+x]=any; vv[y*n+x]= c>0?(float)(s/c):0;}
      float[] w=new float[n*n];
      for(int i=0;i<n*n;i++) w[i]= mm[i] ? (u==null? 0x30 : u[(i/n/2)*prev+(i%n)/2]) : vv[i];
      for(int it=0;it<(u==null?4000:300);it++){ float[] t=w.clone(); for(int y=0;y<n;y++)for(int x=0;x<n;x++){int i=y*n+x; if(!mm[i])continue; float s=0;int c=0; if(x>0){s+=w[i-1];c++;} if(x<n-1){s+=w[i+1];c++;} if(y>0){s+=w[i-n];c++;} if(y<n-1){s+=w[i+n];c++;} t[i]=s/c;} w=t; }
      u=w; prev=n;
    }
    return u;
  }
  /** W×W katman: kaynak 1024 kare görünen alana (gor px) `olcek`le oturur; saydamsa dışı boş, değilse kenar uzatılır */
  static BufferedImage ornekle(BufferedImage k,int W,double gor,double olcek,boolean saydam){
    BufferedImage o=new BufferedImage(W,W,saydam?BufferedImage.TYPE_INT_ARGB:BufferedImage.TYPE_INT_RGB);
    double boy=gor*olcek, x0=(W-boy)/2; int ss=4;
    for(int y=0;y<W;y++)for(int x=0;x<W;x++){
      double a=0,r=0,g=0,b=0;
      for(int sy=0;sy<ss;sy++)for(int sx=0;sx<ss;sx++){
        double u=((x+(sx+0.5)/ss)-x0)/boy*N, v=((y+(sy+0.5)/ss)-x0)/boy*N;
        int iu=(int)Math.floor(u), iv=(int)Math.floor(v);
        if(saydam && (iu<0||iv<0||iu>=N||iv>=N)) continue;
        iu=Math.max(0,Math.min(N-1,iu)); iv=Math.max(0,Math.min(N-1,iv));
        int p=k.getRGB(iu,iv); double al=saydam?((p>>>24)/255.0):1;
        a+=al; r+=((p>>16)&255)*al; g+=((p>>8)&255)*al; b+=(p&255)*al;
      }
      int n=ss*ss; if(saydam){ if(a<=0) continue; o.setRGB(x,y,(cl(a/n*255)<<24)|rgb(r/a,g/a,b/a)); } else o.setRGB(x,y,rgb(r/n,g/n,b/n));
    }
    return o;
  }
}
