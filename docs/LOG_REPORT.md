# Yerel kayıt raporu

Bu belgedeki örnek JSON ve 92 senaryonun tamamı `npm.cmd run test:scenarios`
toplu akışına bağlıdır. [Tüm senaryoları deneme rehberi](ALL_SCENARIOS.md).

`scripts/report-logs.cjs`, mevcut tablo alanlarının metrik dışa aktarımlarını
okuyan bağımsız Node aracıdır. Bağımlılık, API anahtarı, ağ bağlantısı veya veri
yazımı gerektirmez. Webhook, şema ve üretim kodunu değiştirmez.

İnceleme tarihi 22 Eylül 2026: `_shared/reply-agent.ts` içinde
`model_routing_log` yazımı var; `scripts` içinde bu tabloyu raporlayan okuyucu
bulunmadı. `funnel_events`, `audit_log` ve `escalations` şemada var, fakat mevcut
`supabase/functions` içinde bu tablolara yazan üretim akışı bulunmadı. Bunların
canlıda dolu olduğu varsayılmadı; araç gelecek kayıtlar için de hazırdır.

## Çalıştırma

```powershell
node scripts/report-logs.cjs tests/scenarios/log-metrics.example.json
node scripts/report-logs.cjs metrikler.json --from 2026-09-01T00:00:00+03:00 --to 2026-10-01T00:00:00+03:00
node scripts/report-logs.cjs metrikler.json > rapor.json
node scripts/report-logs.cjs metrikler.json --from 2026-09-01T00:00:00+03:00 --to 2026-10-01T00:00:00+03:00 --timezone Europe/Istanbul --budget-usd 25 --warning-percent 80
node scripts/report-logs.cjs tests/scenarios/analytics-cost-cases.json --scenarios > senaryo-raporu.json
```

Çıkış 0 başarılı, 2 kullanım/girdi hatasıdır. Tarih aralığı `[başlangıç, bitiş)`;
filtre bütün tablolarda `created_at` üzerinden uygulanır. Saat dilimi zorunludur.
Filtre dışındaki bozuk kayıtlar da reddedilir; sessiz veri kaybı yapılmaz.

Buradaki zorunlu saat dilimi ISO tarih argümanlarının `Z`/UTC offset bilgisidir.
`--timezone` ise **günlük gruplama** için IANA saat dilimidir; verilmezse açıkça
`UTC` raporlanır. Tarih filtresinin sınırlarını değiştirmez. `--budget-usd`,
yalnız seçilmiş rapor aralığına uygulanır; aralık verilmezse dosyadaki tüm
kayıtları kapsar. Örnekteki 25 USD bir kullanım örneğidir, işletme limiti değildir.

## Genişletilmiş analiz ve senaryo modu

`analytics` bölümünde şunlar bulunur:

- `operations`: qualification, randevu/iptal/erteleme/geliş, insan devri,
  model hata/retry/ret, maliyet uyarısı ve teknik hata **audit olay sayıları**.
  Funnel sayılarıyla toplanmaz. Audit hiç verilmediyse değerler null olur;
  verilmiş ama boşsa sayılar 0'dır, `audit_state` yine boş veri olduğunu belirtir.
- `other_audit_events`: henüz gruplandırılmamış türler; bilinmeyen audit olayı
  kaybolmaz. Şemada izin verilmeyen funnel olayı ise hata üretir.

- `routing_by_day`: seçilen saat diliminde kayıt gününe göre maliyet/gecikme
  ve eksik ölçümler. Yalnız gözlenen günler listelenir.
- `model_mix`: sağlayıcı/model bazında kayıt payı; müşteri payı, başarı oranı
  veya model kalite puanı değildir. Eksik maliyetli satırlar paya dahildir.
- `budget`: bilinen harcama, ölçüm eksiği ve aşağıdaki değerlendirme.
- `diagnostics`: eksik/boş tablolar, eksik maliyet/gecikme ve kaydedilmiş
  telemetry/çağrı hataları. Log kaybı konsolda kalmışsa araç bunu göremez.
- `unavailable_metrics`: tekil müşteri dönüşümü, aktif randevu stoku, model
  hata oranı, SLA ve tam fatura gibi bu projeksiyonla hesaplanamayan ölçüler.

Lead/randevu belgesindeki `appointment_rejected`, randevu grubunda;
`escalated_to_human`, insan devri grubunda sayılır. `escalation_created` ile
`escalated_to_human` ayrı olay sayaçlarıdır; aynı devri anlatabilecekleri için
toplam benzersiz devir sayısı olarak birleştirilmezler.

| Bütçe durumu | Anlamı |
|---|---|
| not_configured | Bütçe verilmedi |
| unknown | Bütçe var fakat seçilen kayıtlardan bilinen maliyet yok |
| below_warning_known_only | Yalnız bilinen maliyet uyarı eşiği altında; güvenli harcama garantisi değil |
| warning | Bilinen maliyet uyarı eşiğine eşit veya üstünde, limit altında |
| at_limit | Bilinen maliyet limite eşit |
| exceeded | Bilinen maliyet limitin üstünde |

`warning-percent` bütçe varsa verilebilir; varsayılan 80, geçerli aralık
0 < yüzde < 100. Bütçe pozitif USD olmalı. Ölçüm veya çağrı kaydı eksikliği
nedeniyle `coverage_verified` her zaman false; eldeki toplam faturayı kanıtlamaz.
Bu araç gerçek çağrı durdurmaz, model değiştirmez, `cost_*` audit olayı yazmaz.
`cost_increase_detected` sayısı kaynakta kaydedilmiş uyarıdır; araç önceki
dönem/kohort kapsamı olmadan artış yüzdesi üretmez.

`--scenarios` modu [92 vakalık kataloğu](../tests/scenarios/analytics-cost-cases.json)
doğrudan okur. Her vaka bağımsız raporlanır; kategori/vaka sayıları dışında
sentetik vakalar bir işletme toplamına birleştirilmez. 10 vaka bilerek bozuk
girdi içerir; bunlar `input_error` olarak görünür. Senaryo modunda çıkış 0
katalog raporunun üretildiğini söyler, kabul testlerinin geçtiğini söylemez.
Asıl doğrulama:

```powershell
node --test tests/analytics-cost-scenarios.test.cjs tests/report-logs.test.cjs
```

Katalogda `story` bağlamı, `when` kayıt anını, `input` hedef metrik projeksiyonunu,
`must_not_record` bu geçişte yazılmaması gereken olayları belirtir. `expected`
rapor alanlarına ilişkin bağımsız kabul beklentisidir; `expected_error` bozuk
girdinin hata beklentisidir. Rapor hesaplaması bu beklentileri okumaz.
CLI filtre/bütçe/saat dilimi seçenekleri vaka seçeneklerini geçersiz kılabilir;
bu durumda orijinal kabul beklentilerinin aynı kalması beklenmez.

Bu testler olay yazan üretim kodunu çalıştırmaz. `input` alanı, hedef olaylar
üretilmiş olsaydı alınacak sentetik projeksiyondur. Gerçek olay yazıcısı için
aynı `story/when/must_not_record` sözleşmesi ayrıca entegrasyon testine alınmalı.
Üretim instrumentation açıkları ve olay sözlüğü
[gereksinim belgesinin 7. bölümündedir](HUMAN_ESCALATION_ANALYTICS_COST_CONTROL_REQUIREMENTS.md#7-analiz-ve-maliyet-incelemesi--22-eylül-2026).

## Girdi hazırlama

Yetkili mevcut dışa aktarım yoluyla **tek işletmenin**, istenen döneme ait,
tekrarsız metriklerini alın. Araç canlı erişim/işletme yetkilendirmesi sağlamaz;
yalnız kendisine verilen satırları özetler. Dışa aktarımın işletme kapsamı,
tarih aralığı ve varsa sayfalama/satır sınırı veri hazırlama aşamasında
doğrulanmalıdır. Araç eksik sayfayı veya karışık işletme verisini saptayamaz.

JSON nesnesinin anahtarları tablo adı, değerleri satır dizileridir:

| Tablo | Alınacak sütunlar |
|---|---|
| model_routing_log | created_at, provider, model, cost_usd, latency_ms |
| funnel_events | created_at, event_type |
| audit_log | created_at, event_type |
| escalations | created_at, status |

Yalnız bu sütunları seçin. Ham `payload`, müşteri mesajları/kimlikleri,
`reason`, `assigned_to` gibi alanlar bu araca girdi değildir; ek sütunlar
reddedilir. Serbest metin alanlarına müşteri bilgisi koymayın. Veri hazırlama
bu aracın yaptığı işlem değildir; canlı veritabanı bağlantısı eklemek ayrı
bir güvenlik incelemesi gerektirir.

Tablo alınmadıysa anahtarı atlayın (`not_supplied`). Alındı fakat hiç kayıt yoksa
`[]` kullanın (`no_rows`). Sentetik örnek girdi:
[`log-metrics.example.json`](../tests/scenarios/log-metrics.example.json).

## Sonuçların anlamı

- Toplam ve model/provider bazında çağrı sayısı, bilinen tahmini USD maliyeti,
  maliyet/gecikme ölçülen ve eksik satır sayıları raporlanır. Numeric maliyet
  metin veya sayı olabilir; null/eksik değer sıfır sayılmaz. Tümü eksikse toplam
  maliyet null olur. Gerçek 0 maliyet sıfır olarak korunur.
- Ortalama ve p95 gecikme yalnız ölçümü bulunan satırlardan hesaplanır. P95,
  sıralı örneklerde `ceil(n * 0.95)` sırasındaki değerdir. Örnekte toplam
  bilinen maliyet 0.00625 USD, ortalama 200 ms, p95 300 ms ve bir eksik ölçüm var.
- Funnel aşamalarının **olay sayıları** gösterilir. Tekrarsız müşteri/kohort
  verisi bulunmadığından dönüşüm yüzdesi hesaplanmaz. Hiç olay olmaması başarılı
  izleme veya %0 müşteri dönüşümü kanıtı değildir.
- Audit event türleri ve escalation status sayıları listelenir. Escalation
  sayıları dışa aktarım anındaki durumdur; tarihsel açık iş yükü veya çözülme
  süresi değildir. ID alınmadığından araç satır tekilleştirme yapmaz.

Tüm dosya bellekte okunur; büyük arşivleri dışa aktarım sırasında dönemlere
bölün. Bu araç toplu rapordur; canlı panel, alarm veya otomatik veri toplama
işi değildir.
