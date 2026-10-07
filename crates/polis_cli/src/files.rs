//! Writing files for the command line.

use std::path::Path;

/// Writes text to a file, creating any folders that are missing on the way.
pub fn write_file(path: &str, text: &str) -> std::io::Result<()> {
    let path = Path::new(path);
    if let Some(folder) = path.parent() {
        if !folder.as_os_str().is_empty() {
            std::fs::create_dir_all(folder)?;
        }
    }
    std::fs::write(path, text)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("polis_files_{}_{name}", std::process::id()))
    }

    #[test]
    fn missing_folders_are_created() {
        let root = scratch("nested");
        let file = root.join("a").join("b").join("town.json");
        write_file(file.to_str().expect("path"), "{\"ok\":true}").expect("written");
        assert_eq!(
            std::fs::read_to_string(&file).expect("read back"),
            "{\"ok\":true}"
        );
        std::fs::remove_dir_all(&root).expect("cleanup");
    }

    #[test]
    fn a_bare_file_name_works_and_can_be_overwritten() {
        let root = scratch("bare");
        std::fs::create_dir_all(&root).expect("folder");
        let file = root.join("town.json");
        write_file(file.to_str().expect("path"), "one").expect("first");
        write_file(file.to_str().expect("path"), "two").expect("second");
        assert_eq!(std::fs::read_to_string(&file).expect("read back"), "two");
        std::fs::remove_dir_all(&root).expect("cleanup");
    }

    #[test]
    fn a_path_with_no_folder_part_is_fine() {
        assert!(Path::new("town.json")
            .parent()
            .is_some_and(|p| p.as_os_str().is_empty()));
    }
}
