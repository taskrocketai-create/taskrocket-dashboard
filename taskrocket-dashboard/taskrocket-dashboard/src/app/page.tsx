import { supabase, Client } from "@/lib/supabase";
import Link from "next/link";
import styles from "./page.module.css";

export const revalidate = 60;

export default async function HomePage() {
  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .order("business_name");

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.rocket}>🚀</span>
          <span className={styles.brand}>TaskRocket</span>
        </div>
        <p className={styles.tagline}>Client Dashboards</p>
      </header>

      <section className={styles.grid}>
        {clients?.map((client: Client) => (
          <Link
            key={client.id}
            href={`/${client.slug}`}
            className={styles.card}
          >
            <div className={styles.cardIcon}>
              {client.business_name.charAt(0).toUpperCase()}
            </div>
            <div className={styles.cardInfo}>
              <h2 className={styles.cardName}>{client.business_name}</h2>
              <p className={styles.cardSlug}>/{client.slug}</p>
            </div>
            <span className={styles.arrow}>→</span>
          </Link>
        ))}

        {(!clients || clients.length === 0) && (
          <p className={styles.empty}>No clients yet.</p>
        )}
      </section>
    </main>
  );
}
