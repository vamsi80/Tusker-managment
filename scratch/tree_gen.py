import os

def write_tree(root_dir, exclude_dirs, output_file):
    with open(output_file, 'w', encoding='utf-8') as f:
        for root, dirs, files in os.walk(root_dir):
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            
            level = root.replace(root_dir, '').count(os.sep)
            indent = '  ' * level
            folder_name = os.path.basename(root)
            if folder_name:
                f.write(f'{indent}{folder_name}/\n')
            
            sub_indent = '  ' * (level + 1)
            for file_name in files:
                f.write(f'{sub_indent}{file_name}\n')

if __name__ == "__main__":
    output_path = os.path.join(os.getcwd(), 'scratch', 'full_tree.txt')
    write_tree(os.getcwd(), {'.git', 'node_modules', '.next', 'dist', '.kilo', '.vscode', '.gemini'}, output_path)
    print(f"Tree written to {output_path}")
