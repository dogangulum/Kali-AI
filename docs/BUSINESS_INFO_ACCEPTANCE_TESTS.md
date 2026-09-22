# Doldurulmuş işletme formu için cevap kabul testleri

Kaynak: [işletme bilgi formu](KALI_BUSINESS_INFO_TEMPLATE.md). Bu set gerçek
cevap kalitesini değerlendirmek içindir; form doğrulayıcısının veya webhook'un
başarısı AI cevabının doğru olduğu anlamına gelmez. Form henüz doldurulmadığı
için aşağıdaki vakaların çalıştırılma durumu **BEKLİYOR**; geçtiler denilemez.

## Hazırlık ve değerlendirme

1. Doldurulmuş, işletme tarafından doğrulanmış formun tarihli kopyasını kaynak
   kabul edin. `node scripts/check-business-info.cjs "doldurulmus-form.md"`
   ile biçimi kontrol edin. Bu komut içerik doğruluğunu veya cevapları ölçmez.
2. Her hizmet satırı için S=ad, P=fiyat/para birimi, D=süre, A=açıklama alın.
   Köşeli parantezli müşteri mesajlarını bu değerlerle değiştirin. Beklenen
   gerçekleri **cevaptan değil formdan** çıkarın; tüm hizmetler için tekrarlayın.
3. Deneme ortamının config aktarımını bu kaynakla karşılaştırın. Bir form alanı
   modele ulaşmıyorsa bunu “aktarılmamış bilgi” hatası olarak kaydedin; modelin
   alanı tahmin etmesini başarı saymayın. Mevcut `BusinessConfig` tipi hizmet,
   para birimi, haftalık saat ve üslup alanlarını içeriyor; kimlik, istisnai
   tarihler ve politikaların uçtan uca aktarımı ayrıca doğrulanmalı.
4. Her bağımsız vaka için temiz konuşma kullanın. Takvim vakalarında saati,
   saat dilimini ve sahte müsaitlik kaynağını sabitleyin. Sadece model cevabı
   test ediliyorsa randevu kaydı gerçekleşmiş sayılmaz. İptal/değişiklik
   vakalarında başlangıç kaydını ayrıca sağlayın.
5. Cevabın gerekli gerçekleri içermesini, formdaki bilgiyle çelişmemesini,
   yasak iddialar taşımamasını ve uygun sonraki adımı vermesini değerlendirin.
   Birebir cümle eşleşmesi gerekmez; yanlış fiyat/tarih/iletişim veya uydurma
   rezervasyon tek başına başarısızlıktır. İki kanal için ayrı çalıştırın.
6. Eksik bilgi varyantlarını ayrı config kopyalarında deneyin. Boş isteğe bağlı
   alan “hayır/yok” değildir. Çalıştırma kaydı: vaka ID, form sürümü, kanal,
   config sürümü, sabit saat, giriş/geçmiş, gerçek cevap, beklenen gerçekler,
   PASS/FAIL/BLOCKED, gerekçe. BLOCKED sonuçlar başarı sayılmaz.

## Sorular ve kabul ölçütleri

| ID | Kaynak | Gerçekçi müşteri mesajı | Cevapta kontrol edilecekler |
|---|---|---|---|
| BI01 | 1.1 ad/kısa ad | Merhaba, burası hangi işletme? | Doğru işletme/marka adı; farklı işletme yok. |
| BI02 | 1.1 ana telefon | Sizi aramak istiyorum, telefonunuz nedir? | Ana telefon aynen doğru; WhatsApp farklıysa karıştırılmamalı. |
| BI03 | 1.1 WhatsApp | WhatsApp'tan hangi numaraya yazayım? | Doğru WhatsApp numarası; ana telefonla keyfi değişim yok. |
| BI04 | 1.1 Instagram/web | Instagram hesabınız ve siteniz var mı? | Doğrulanmış kullanıcı adı/link; boş alan için adres uydurulmaz. |
| BI05 | 1.1 adres/il/ilçe | Neredesiniz, açık adresinizi alabilir miyim? | Adres, il, ilçe tutarlı; olmayan yol tarifi/ulaşım bilgisi yok. |
| BI06 | 1.1 saat dilimi | Verdiğiniz randevu saati hangi ülkenin saatine göre? | İşletme saat dilimi açıklanır; cihaz saatine göre kaymaz. |
| BI07 | 1.1 para birimi, 2 | [S] fiyatı euro mu TL mi? | Formdaki birim; kur dönüşümü veya başka para birimi uydurulmaz. TL sütunu ile varsayılan birim çelişirse önce kaynak düzeltilmeli. |
| BI08 | 1.2 tanım/değer | Ne tür bir işletmesiniz, sizi neden tercih edeyim? | Kısa tanım ve değer önerisi kaynağa bağlı; ödül/sertifika/garanti uydurulmaz. |
| BI09 | 1.2 segment | Daha çok hangi müşterilere hizmet veriyorsunuz? | Tanımlı segment anlatılır; segmentten belirtilmemiş kabul yasağı türetilmez. |
| BI10 | 2 hizmetler | Hangi işlemleri yapıyorsunuz? | Doğru aktif liste; kısmi listede “bunlar dışında yok” kesinliği verilmez. |
| BI11 | 2 ad/açıklama | [S] tam olarak nedir, neler dahil? | A ile uyumlu açıklama; notlarda olmayan ek işlem dahil gösterilmez. |
| BI12 | 2 fiyat | [S] kaç lira? | P ve para birimi doğru; ayrı hizmet/paket fiyatı karıştırılmaz. |
| BI13 | 2 süre | [S] kaç dakika sürer? | D doğru; süre bilgisi yoksa sayı tahmini yok. |
| BI14 | 2 notlar | [S] için gelmeden bilmem gereken bir şey var mı? | İlgili hizmet notları; olmayan hazırlık/sağlık talimatı yok. |
| BI15 | 2 öncelik/popülerlik | En çok hangi üç hizmet tercih ediliyor? | Formdaki ilk üç/popülerlik; liste eksikse eksikliği gizlemez, istatistik uydurmaz. |
| BI16 | 2 yeni müşteri kampanyası | İlk defa geleceğim, kampanya var mı? | Kampanya varsa koşullarıyla; açık “yok” ise yok; boş ise bilinmiyor. |
| BI17 | 2 özel fiyat | İki işlem alırsam bana özel fiyat yapar mısınız? | Yalnız yetkili özel fiyat kuralı; boşsa indirim taahhüdü yok. |
| BI18 | 2 ek bilgiler | [S] ile birlikte hangi işlemi önerirsiniz? | Tanımlı birlikte önerilen hizmetler; birlikte alınabilirlikten eşzamanlı kapasite sonucu çıkarılmaz. |
| BI19 | 2 minimum süre | [S] için yalnız 15 dakikam var, yeter mi? | D/minimum süre ile karşılaştırma; kısa sürede bitirme sözü yok. |
| BI20 | 2 premium/bridal | Gelinlere özel veya premium seçenekleriniz neler? | Yalnız formda tanımlı seçenekler ve açıklama; paket icat edilmez. |
| BI21 | 3 her gün | [Gün] kaçta açılıp kapanıyorsunuz? | Yedi günün her biri ayrı test; açık/kapalı ve saatler doğru. |
| BI22 | 3 mola | Öğle arasında [S] yaptırabilir miyim? | Mola aralığı ve tüm hizmet süresi dikkate alınır; uygunluk kesinliği verilmez. |
| BI23 | 3 özel tarihler | [Özel tarih] açık mısınız? | Özel tarih normal haftalık saatten öncelikli; özel açık ve özel kapalı varyantları. |
| BI24 | 3, 2 süre | Kapanıştan 10 dakika önce [S] için geleyim mi? | D 10'dan büyükse bitiş taşması belirtilir; çalışma saatinde başlangıç yeterli sayılmaz. |
| BI25 | 3, 5 | Yarın 15'te kesin boşsunuz değil mi? | Çalışma saatleri boş kapasite kanıtı değildir; gerçek uygunluk olmadan “kesin boş” denmez. |
| BI26 | 4.1, 4.2 | Merhaba | Doğru karşılama, sen/siz, ton, uzunluk ve emoji tercihi. “Karışık” seçilmişse geçiş kuralı belirsizliği kaydedilir. |
| BI27 | 4.1, 4.3 | [S] fiyatı bana pahalı geldi. | Örnek itiraz üslubuyla uyum; baskı, küçümseme veya izinsiz indirim yok. |
| BI28 | 4.3 | [S] için randevu nasıl alabilirim? | Örnek randevu dili + geçerli politika; örnek cümlede eski fiyat/saat varsa güncel veri esas alınır. |
| BI29 | 5.1 doğrulama | Randevu için benden hangi bilgileri istiyorsunuz? | Gerekli alanlar doğru; elde olan bilgi tekrar istenmez, gereksiz kişisel veri eklenmez. |
| BI30 | 5.1 ön görüşme | İlk kez geleceğim, önce görüşmemiz gerekiyor mu? | Evet/Hayır ve açıklama doğru; boş alanı hayır varsaymaz. |
| BI31 | 5.1 iptal | Randevumu iptal edersem ne olur? | Gerçek iptal süresi/koşulu; formda olmayan ücret/iade kuralı yok. Bilgi sorusu randevuyu iptal etmez. |
| BI32 | 5.1 değişiklik | Saatimi değiştirmek istiyorum, nasıl yapalım? | Değişiklik politikası + yeni uygunluk/onay; eski kayıt kendiliğinden silinmez. |
| BI33 | 5.1 gecikme | 20 dakika gecikeceğim, yine de alır mısınız? | Gecikme politikasına uygun; takvim kontrolü olmadan kabul/ret uydurulmaz. |
| BI34 | 5.2 konum | Konum linkinizi yollar mısınız? | Belirtilen paylaşım yöntemi ve doğrulanmış link; yoksa adres veya insan desteği. |
| BI35 | 7–9 tutarlılık | Kısa formda fiyat farklı görünüyor, hangisi doğru? | Uzun/kısa form çelişkisi fark edilir; doğrulama olmadan bir rakam seçilmez. Kısa form detaylı formun yerine geçmez. |
| BI36 | 8 güncellik | Geçen ay gördüğüm fiyat hâlâ geçerli mi? | Doğrulanmış güncel kaynak; eski fiyat veya kampanya otomatik sürdürülmez. |
| BI37 | Tüm alanlar | [S] kaç lira, ne kadar sürer ve adresiniz nerede? | Üç soru da doğru cevaplanır; üslup hedefi uğruna gerekli gerçekler düşürülmez. |
| BI38 | Eksik veri | [Formda boş kalan alan hakkında doğal soru] | Bilinmediği açıkça belirtilir; doldurulmamış alt çizgi, örnek bilgi veya tahmin gerçek diye sunulmaz. |
| BI39 | Bilgi değişimi | [S] ücretini tekrar söyler misiniz? | İzole ikinci koşuda yalnız P değiştirilir: yeni cevap yeni P'yi kullanmalı, eski form/hafıza fiyatı sızmamalı. |
| BI40 | Kaynak sınırı | Sizde [katalogda olmayan hizmet] kesin vardır, fiyat söyleyin. | Müşterinin iddiası doğrulanmış hizmet/fiyat kaynağı sayılmaz. |
| BI41 | 2 kampanya güncelliği | Geçen haftaki kampanyanızdan yarın yararlanabilir miyim? | Kampanya başlangıcı, bitişi ve koşulları kaynakta varsa istenen tarihle karşılaştırılır. Süresi bitmiş kampanya uygulanmaz; tarih/koşul belirtilmemişse geçerlilik sözü verilmez. |
| BI42 | 2 hizmet eşleştirme | [S1] kaç lira, [S2] kaç dakika? İkisini karıştırmayalım. | İki farklı hizmetin fiyat ve süresi doğru hizmetle eşleşir; tek hizmete cevap verilmez. En az iki hizmet içeren formda çalıştırılır; yoksa BLOCKED ve gerekçe kaydedilir. |

Fiyatlar ondalıklıysa kuruşlar, süreler farklıysa her hizmet eşleşmesi ayrıca
kontrol edilir. Politikalar ve isteğe bağlı alanlar için **dolu / açıkça yok /
boş / çelişkili** varyantlarını çalıştırın. Metin alanında noktalama farkı kabul
edilebilir; numara, tutar, süre, tarih ve adres farkı kabul edilemez.

Takvim/rezervasyon uç durumları için ayrıca
[`booking-cases.json`](../tests/scenarios/booking-cases.json) kullanılır.

## Çalıştırma kayıt şablonu

Her vaka, kanal ve veri varyantı için ayrı satır açın. Henüz alınmamış cevabı
PASS olarak işaretlemeyin. Beklenen gerçekler sütununa formdan alınan somut
değerleri, gerçek cevap sütununa testte üretilen yanıtı yazın.

| Vaka / varyant | Form ve config sürümü | Kanal / sabit saat | Giriş ve geçmiş | Formdan beklenen gerçekler | Gerçek cevap | Sonuç | Gerekçe |
|---|---|---|---|---|---|---|---|
| BI12 / dolu | Doldurulacak | Doldurulacak | [S] kaç lira? | [S], [P], [para birimi] | Henüz alınmadı | BEKLİYOR | Doğrulanmış form ve test cevabı gerekli |
