import { MessageCircle, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { company } from "@/config/company";
import { messages } from "@/lib/messages";

/**
 * Şirket iletişimi (OD-14, BR-170/171). Değerler sabit yapılandırmadan; tanımlı değilse sahte numara
 * veya çalışmayan bağlantı yerine pasif buton + "yakında" metni. WhatsApp yalnızca tıklamayla açılır;
 * mesaja token/başvuru/kişisel veri eklenmez.
 */
export function ContactCard() {
  const phone = company.phoneE164;
  const whatsapp = company.whatsappE164;
  return (
    <section
      aria-labelledby="contact-title"
      className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
    >
      <h2 id="contact-title" className="text-lg leading-7 font-semibold">
        Yardıma mı ihtiyacınız var?
      </h2>
      <p className="text-base text-muted-foreground">
        Sorularınız için {company.name} ile iletişime geçebilirsiniz.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {phone ? (
          <Button asChild variant="outline" size="lg">
            <a href={`tel:${phone}`}>
              <Phone aria-hidden="true" />
              Telefonla ara
            </a>
          </Button>
        ) : (
          <Button variant="outline" size="lg" disabled aria-describedby="contact-soon">
            <Phone aria-hidden="true" />
            Telefonla ara
          </Button>
        )}
        {whatsapp ? (
          <Button asChild size="lg">
            <a
              href={`https://wa.me/${whatsapp.slice(1)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle aria-hidden="true" />
              WhatsApp ile yazın
            </a>
          </Button>
        ) : (
          <Button size="lg" disabled aria-describedby="contact-soon">
            <MessageCircle aria-hidden="true" />
            WhatsApp ile yazın
          </Button>
        )}
      </div>
      {!phone || !whatsapp ? (
        <p id="contact-soon" className="text-sm text-muted-foreground">
          {messages.portal.contactSoon}
        </p>
      ) : null}
    </section>
  );
}
