import dayjs from "dayjs";
export const inMinutes = (min: number) => dayjs().add(min, "minute").toDate();
